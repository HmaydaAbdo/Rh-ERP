# PV N°1 — Cadrage et évolutions d’ERP-RH

**Date de préparation :** 22 octobre 2026  
**Objet :** trajectoire de stabilisation de toute l’application ERP-RH  
**Domaines décrits :** Équipe, Fonction, Chantier, Employé, Paie, Rapport, Auth, Paramètres et Audit

**Version stable visée :** `1.0.0` pour le frontend et le backend  
**État du document :** projet interne à valider par le propriétaire avant toute transmission aux intervenants. Il ne constate pas encore un accord collectif.

> **Règle de lecture :** ce document sépare les règles et faits déjà vérifiés, les décisions proposées aux intervenants, les sujets encore ouverts et les preuves de réalisation. Une décision ne sera qualifiée d’« accord collectif » qu’après validation explicite des personnes concernées. Une réserve ou un rejet restera visible dans le compte rendu.

## 1. Objet du PV

Ce PV définit le cadre commun pour faire évoluer ERP-RH de sa version actuelle vers une application stable, compréhensible et vérifiable par ses utilisateurs et ses responsables métier.

Le présent PV décrit les domaines Équipe, Fonction, Chantier, Employé, Paie, Rapport, Auth, Paramètres et Audit.
Chaque bloc expose leurs règles, liens, écrans, accès et preuves de contrôle. Leur présence dans le document ne
présume pas un accord métier : les accords, réserves et rejets restent à recueillir selon les tableaux de chaque bloc.

La version stable `1.0.0` sera annoncée lorsque les blocs prévus auront été examinés, que les décisions requises auront été enregistrées et que les contrôles de livraison applicables auront réussi.

## 2. Principes communs soumis à accord

Les principes suivants forment le cadre proposé pour tous les futurs blocs :

1. **Chaque domaine est décrit avant sa modification.** Le dossier expose le rôle du domaine, ses données, ses règles, ses liens avec les autres domaines, ses accès, ses parcours et ses limites connues.
2. **Les règles sont dites clairement.** Chaque règle métier est formulée en langage compréhensible, avec des exemples utiles et le résultat attendu lorsque la règle est respectée ou non.
3. **Toute règle importante est vérifiée.** Les contrôles doivent couvrir le cas normal, les limites, les erreurs, les droits d’accès et les interactions entre domaines concernées. Les résultats et les éventuels échecs sont présentés sans les masquer.
4. **Une exception est examinée, pas dissimulée.** Elle indique la règle concernée, la raison, les personnes et données touchées, le risque, la mesure temporaire, la personne responsable et la date de réexamen. Elle ne devient une décision qu’après approbation explicite.
5. **Les trois vues de collection sont partagées entre les domaines.** Tabulaire sert à retrouver et comparer. Cartes suit la hiérarchie fixe déclarée par le domaine; chaque ouverture avance d'une étape et ajoute son groupe au fil. Analytique présente les indicateurs et graphiques propres au sujet du domaine, dans l'ordre de priorité déclaré par sa configuration. Les filtres métier restent cohérents entre les vues. Paie, Employés, Équipes, Fonctions et Chantiers utilisent les composants partagés Cartes et Analytique (ADR 0011, 0014), ainsi que la coque et le Tabulaire configurables (ADR 0012).
6. **Les droits restent attachés aux données de leur domaine.** Une vue qui rassemble plusieurs domaines n’élargit pas les accès. Elle présente chaque information seulement aux personnes habilitées pour cette information.
7. **Une proposition n’est pas un accord.** Les faits vérifiés, décisions déjà approuvées, propositions, points ouverts, réserves et rejets sont identifiés séparément.
8. **Aucun document de décision n’est diffusé sans validation du propriétaire.** Avant transmission aux intervenants, le propriétaire reçoit la version complète, avec les faits, règles, risques, décisions attendues et preuves disponibles, puis valide explicitement sa diffusion.

## 3. Premier bloc — domaine Équipe

Le domaine Équipe est le premier domaine examiné. Son rôle, les règles, les vues, les liens Employé/Paie,
les API, les droits et les scénarios de test sont centralisés dans le [dossier Équipe](../equipe/README.md),
qui évolue avec le comportement de l'application.

La base ne conserve plus l'équipe combinée `CH+OP`. Ses bulletins historiques et ses fiches encore actives
sont répartis selon leur fonction : `CH.` et `COURSIER` vers `CH`, `OP.` vers `OP`, et `CHEF DE POSTE`
vers `EE`. Les fiches inactives n'ont aucune équipe courante; leurs bulletins conservent le reclassement
de leur historique mensuel. Une fonction non classée bloque la migration et les opérations sont auditées.

Les règles et scénarios actuellement appliqués sont centralisés dans le [README Équipe](../equipe/README.md) :
le code modifié est affiché dans les bulletins historiques qui référencent l'équipe; la suppression d'une équipe référencée
par Paie ou Employé est bloquée; le rattachement d'équipe reste facultatif sur les bulletins.
La fiche Employé représente son état courant dérivé du dernier mois de paie enregistré. Une fiche active a un chantier;
l'équipe y reste facultative. Une fiche inactive n'a ni chantier ni équipe courants. Chaque bulletin conserve séparément
les affectations de son mois et reste inchangé après un départ ou une mutation. Au retour confirmé par l'import, la fiche
reprend le chantier et l'équipe de la ligne importée. Les règles détaillées et leurs tests restent dans les README Employé,
Équipe et Paie.

## 4. État de réalisation du premier bloc

Les vues métier utilisent la coque et le Tabulaire configurables partagés, ainsi que les vues Cartes
et Analytique partagées décrites dans les ADR 0011, 0012 et 0014. L'import Excel du référentiel est livré avec
la migration V32. Les scénarios de code, interface, autorisations et parcours sont décrits dans le
README Équipe, qui donne aussi les commandes et résultats locaux à jour.

La revue propriétaire suit l'ordre global : **Équipe → Fonction → Chantier → Employé → Paie**.
Cet ordre n'établit ni accord métier ni validation de production.

Dans les vues Équipe, la Paie du dernier mois enregistré est la source des indicateurs. Les Cartes présentent
séparément les quatre mesures, leur valeur et leur comparaison au mois précédent; l’effectif des fiches Employé n’y est
pas chargé et les bulletins sans équipe n’y forment pas de carte. Une section Analytique dédiée présente un graphique
d’anneau distinct des graphiques de répartition, avec les bulletins sans équipe et leurs filtres Chantier/Fonction;
elle n’apparaît que si le dernier mois contient des bulletins sans équipe et s’exporte en PDF. Le graphique qualité
n’apparaît ni dans le Tabulaire ni dans Cartes. Les règles détaillées sont dans le README Équipe.

## 5. Source des preuves Équipe

La description métier, les règles confirmées et les scénarios de contrôle Équipe sont regroupés dans
le [README Équipe](../equipe/README.md). Le PV global conserve uniquement le cadre commun et les
décisions qui concernent plusieurs domaines.
## 6. Traitement d’une exception

Si une règle ne peut pas être respectée dans un cas précis, l’exception est présentée séparément. Elle contient au minimum :

1. la règle et le cas concernés;
2. la raison vérifiée et la portée de l’exception;
3. les utilisateurs, données et opérations touchés;
4. le risque et la mesure qui limite ce risque;
5. la personne responsable, la date d’expiration ou de réexamen;
6. l’avis des intervenants concernés et la validation explicite du propriétaire.

Une exception ne sera pas cachée dans une note, un test désactivé ou une formulation générale. Les règles de sécurité, de confidentialité et d’intégrité des données ne peuvent pas être écartées par une simple dérogation. Tant que l’exception n’est pas approuvée, la règle initiale reste la référence et le PV indique le point comme non résolu.

## 7. Décisions et accords des intervenants

Les décisions de cadrage communes restent dans le présent PV. Les règles confirmées propres à Équipe
sont décrites dans son [README](../equipe/README.md). La signification et le libellé des codes provisoires
`A`, `LABO`, `ASPHALET` et `8` restent suivis dans la tâche globale « Qualité des données » de `TODO.md`.

## 8. Compte rendu de signature

Le compte rendu collectif et les avis des intervenants seront ajoutés au présent PV lors de la revue
commune. Il n'y a pas de formulaire de validation technique distinct par domaine.
## 9. Deuxième bloc — domaine Fonction

**État du bloc :** implémenté avec les composants partagés décrits dans le dossier du domaine. Les contrôles et la description métier restent centralisés dans le [README Fonction](../function/README.md). Ce bloc applique le cadre commun des sections 2 et 6.

### 9.1 Rôle du domaine et liens avec l’application

Le référentiel Fonction fournit le libellé du poste occupé. Il relie trois informations distinctes :

- **Référentiel Fonction :** les fonctions connues, chacune avec un libellé.
- **Situation Employé :** la fonction enregistrée sur la fiche Employé au dernier mois de paie importé.
- **Historique Paie :** la fonction portée par chaque bulletin de sa période, qui reste lisible même si la fiche Employé change ensuite.

La fiche Employé et le bulletin décrivent des situations distinctes; les vues Cartes et Analytique Fonction ne chargent que les données Paie du dernier mois enregistré.

### 9.2 Parcours, indicateurs et accès

| Vue | Contenu |
|---|---|
| **Tabulaire** | Liste paginée, recherche par libellé, consultation, modification et suppression selon les droits; import Excel et création dans l’en-tête commun; export PDF de toutes les lignes filtrées. |
| **Cartes** | Parcours fonction → chantier → équipe; données du dernier mois de Paie, cartes triées par masse salariale puis effectif payé, sans filtre de période ni raccourci vers le Tabulaire. Le mois, le résumé du périmètre et l'export PDF sont regroupés dans l'en-tête du niveau. Avec `EMPLOYEE_READ`, une icône d'accès Employés avec infobulle figure à droite du titre de niveau et conserve le périmètre. |
| **Analytique** | Indicateurs et graphiques Paie (STC compris), répartition par fonction et évolution mensuelle; la période est fixée au dernier mois enregistré. Le graphique de répartition masque les valeurs nulles; son tableau voisin conserve les fonctions complètes du périmètre. Une section qualité distincte affiche, si nécessaire, le graphique d'anneau des bulletins sans équipe et ses filtres Chantier/Fonction. |

Les indicateurs sont ceux de la section 3.3, et la répartition par fonction indique aussi le nombre et le montant des soldes de tout compte (STC) de chaque fonction. Le filtre par libellé agit de la même façon dans les trois vues. Les droits restent séparés : `FUNCTION_READ` pour le référentiel, `EMPLOYEE_READ` pour les effectifs des fiches, `PAIE_READ` pour les indicateurs et montants Paie.

### 9.3 Règles déjà appliquées, constats et points à décider

Faits vérifiés dans la version actuelle :

- le libellé est obligatoire, limité à 100 caractères, sans espaces en début et en fin, et unique sans tenir compte de la casse;
- supprimer une fonction référencée par une fiche Employé ou un bulletin est refusé;
- renommer une fonction change son libellé partout, historique compris;
- le référentiel ne comporte pas de statut actif ou inactif;
- l’import Excel est atomique : une ligne invalide rejette tout le fichier.

**Aucune règle nouvelle n’est introduite par ce bloc.** Décisions du propriétaire du 23 octobre 2026, à présenter aux intervenants pour avis :

- **Renommage :** le comportement actuel est conservé. Le nouveau libellé s’applique partout, historique de paie compris; c’est le moyen de corriger une faute de frappe.
- **Suppression :** le refus actuel est conservé. Une fonction référencée par une fiche Employé ou un bulletin ne peut pas être supprimée.

Hors de ce bloc : le **nettoyage des quasi-doublons** (neuf paires de libellés très proches ont été inventoriées, toutes utilisées) est suivi dans le sujet « Qualité des données » du [TODO](../../TODO.md). Il suppose le choix du libellé conservé et le rattachement des fiches et bulletins concernés, par migration auditée; il n’est pas traité ici.

### 9.4 Preuves et accords à recueillir

| Sujet à vérifier | Preuve attendue | État avant signature |
|---|---|---|
| Trois vues et filtre conservé | Parcours des trois vues avec le même filtre dans l’adresse | Scénarios frontend et navigateur; détails dans le README Fonction |
| Situation Employé distincte de l’historique Paie | Exemple avec changement de fonction entre deux mois | À confirmer |
| Indicateurs Paie et mois sans bulletin | Valeurs comparées à des exemples Paie vérifiés; fonction sans bulletin sur le mois choisi | Cas du mois sans bulletin couvert par test; valeurs à comparer |
| Accès par domaine | Essai avec un compte autorisé et un compte privé de `EMPLOYEE_READ` et `PAIE_READ` | Tests d'autorisation et parcours navigateur; détails dans le README Fonction |
| Libellé : validations | Cas valides, doublons, champs vides, espaces extérieurs, limites de longueur | Tests existants; messages à confirmer |
| Renommage et suppression d’une fonction utilisée | Décision du propriétaire (comportement actuel conservé) et avis écrit des intervenants | Décision du propriétaire prise le 23 octobre 2026; avis des intervenants attendu |

| Décision attendue | Accord | Réserve ou rejet et motif |
|---|---|---|
| Les trois vues et leur contenu représentent correctement le besoin Fonction. | À compléter | À compléter |
| Les indicateurs Paie de la section 9.2 sont ceux attendus, STC compris dans la répartition par fonction. | À compléter | À compléter |
| Le renommage d’une fonction utilisée change son libellé partout, historique compris (décision du propriétaire). | À compléter | À compléter |
| Le refus de suppression d’une fonction utilisée est maintenu (décision du propriétaire). | À compléter | À compléter |

Les signatures de ce bloc seront recueillies sur le modèle de la section 8.

## 10. Troisième bloc — domaine Chantier

**État du bloc :** implémenté avec les composants partagés décrits dans le dossier du domaine. Les contrôles et la description métier restent centralisés dans le [README Chantier](../chantier/README.md). Ce bloc applique le cadre commun des sections 2 et 6.

### 10.1 Rôle du domaine et liens avec l’application

Le référentiel Chantier fournit le code, la désignation, le nom éventuel et le statut (« En cours » ou « Clôturé ») des chantiers. Il relie trois informations distinctes :

- **Référentiel Chantier :** les chantiers connus, ajoutés par la synchronisation avec l’ERP ou saisis à la main.
- **Situation Employé :** le chantier enregistré sur la fiche Employé au dernier mois de paie importé.
- **Historique Paie :** le chantier porté par chaque bulletin de sa période, qui reste lisible même si la fiche Employé change ensuite.

La situation Employé récente et l’historique Paie ne sont jamais présentés comme décrivant la même période. La **carte géographique** reste un écran à part, avec son droit propre.

### 10.2 Parcours, indicateurs et accès

| Vue | Contenu |
|---|---|
| **Tabulaire** | Liste paginée, recherche par code, désignation et statut, consultation, modification, clôture ou réouverture, suppression selon les droits; synchronisation et création dans l’en-tête commun. |
| **Cartes** | Parcours chantier → équipe → fonction; statut et quatre indicateurs du dernier mois de paie, comparés au mois précédent. Tri par masse salariale puis effectif. |
| **Analytique** | Répartition par chantier et suivi mensuel d’un chantier : Effectif, Masse salariale, STC en personnes et en DH, avec filtres Fonction et Équipe. Valeurs nulles masquées dans les répartitions. Section qualité dédiée aux bulletins sans équipe. |

Les indicateurs sont ceux de la section 3.3 (pour un chantier sélectionné, le nombre de chantiers concernés n’est pas répété) et la répartition indique le nombre et le montant des soldes de tout compte de chaque chantier. Les filtres par code, désignation et statut agissent de la même façon dans les trois vues. Les droits restent séparés : `CHANTIER_READ` pour le référentiel, `EMPLOYEE_READ` pour les effectifs des fiches, `PAIE_READ` pour les indicateurs et montants Paie.

### 10.3 Règles déjà appliquées et constats

- le code et la désignation sont obligatoires à la création manuelle; le code est unique sans tenir compte de la casse ni des espaces extérieurs;
- la synchronisation avec l’ERP n’ajoute que les chantiers manquants : elle ne modifie, ne clôture ni ne supprime jamais un chantier existant;
- clôturer un chantier ne le supprime pas : il reste consultable et référencé par l’historique, mais n’est plus accepté par l’import des employés et l’assistant d’import de la paie propose de le rouvrir (décision du propriétaire du 19 octobre 2026);
- la période la plus récente enregistrée dans la Paie définit les chantiers opérationnels; la migration V35 clôture les chantiers encore en cours qui n'apparaissent pas dans cette période, même s'ils ont un historique. Sans bulletin en base, elle ne change aucun statut. Cette migration est une reprise unique et ne rend pas la clôture automatique à chaque import;
- supprimer un chantier référencé par une fiche Employé ou un bulletin est refusé; la clôture est l’alternative;
- modifier le code d’un chantier le change pour tous les bulletins et fiches qui le référencent, historique compris : **décision du propriétaire du 23 octobre 2026, ce comportement est conservé**, c’est le moyen de corriger une faute de saisie.

**Aucune règle nouvelle n’est introduite par ce bloc.** Hors de ce bloc, le doublon apparent du chantier `C157A` reste suivi dans le [TODO](../../TODO.md).

### 10.4 Preuves et accords à recueillir

| Sujet à vérifier | Preuve attendue | État avant signature |
|---|---|---|
| Trois vues et filtres conservés | Parcours des trois vues avec les mêmes filtres dans l’adresse | Scénarios frontend et navigateur; détails dans le README Chantier |
| Situation Employé distincte de l’historique Paie | Exemple avec changement de chantier entre deux mois | À confirmer |
| Indicateurs Paie et mois sans bulletin | Valeurs comparées à des exemples Paie vérifiés; chantier sans bulletin sur le mois choisi | Cas du mois sans bulletin couvert par test; valeurs à comparer |
| Accès par domaine | Essai avec un compte autorisé et un compte privé de `EMPLOYEE_READ` et `PAIE_READ` | Tests d'autorisation et parcours navigateur; détails dans le README Chantier |
| Statut En cours / Clôturé | Filtre par statut, clôture et réouverture avec confirmation | Couvert par tests |
| Modification du code d’un chantier utilisé | Décision du propriétaire (comportement actuel conservé) et avis écrit des intervenants | Décision du propriétaire prise le 23 octobre 2026; avis des intervenants attendu |

| Décision attendue | Accord | Réserve ou rejet et motif |
|---|---|---|
| Les trois vues et leur contenu représentent correctement le besoin Chantier. | À compléter | À compléter |
| Les indicateurs Paie de la section 10.2 sont ceux attendus, STC compris dans la répartition par chantier. | À compléter | À compléter |
| La modification du code d’un chantier utilisé change le code partout, historique compris (décision du propriétaire). | À compléter | À compléter |

Les signatures de ce bloc seront recueillies sur le modèle de la section 8.

## 11. Domaine Employé

### 11.1. Rôle et liens

La fiche Employé conserve l’identité et la situation courante de la personne : fonction, chantier, équipe, statut et,
pour les lecteurs autorisés, salaire et type de salaire. Elle représente le dernier état de paie enregistré. Les
bulletins gardent leurs propres affectations mensuelles; les changements de fiche ne réécrivent pas les mois passés.
Les règles, contrats et scénarios détaillés sont centralisés dans le [dossier Employé](../employee/README.md).

### 11.2. Parcours et indicateurs

| Parcours | Contenu et périmètre |
|---|---|
| Tabulaire | Recherche par nom et CIN, filtres multiples fonction/chantier/équipe et statut; tri, colonnes configurables, pagination et accès à la fiche. |
| Cartes | Descente chantier → équipe → fonction → employés, avec fil de navigation et accès à la liste sur le même périmètre. Les effectifs courants proviennent des fiches. |
| Analytique | Effectif des fiches, en poste/sortis, âge et ancienneté moyens, embauches des douze derniers mois, tranches et répartitions. La paie et ses mouvements historiques restent identifiés comme des données mensuelles distinctes. |
| Fiche et saisie | Identité, affectations et statut; salaire et parcours avec `PAIE_READ`. Les chargements et erreurs de lecture sont annoncés et permettent un réessai avant toute saisie. |
| Import | Ajout atomique des CIN inédits; toute ligne invalide rejette le fichier. Le détail indique le numéro réel de la ligne Excel. |

Les trois vues partagent les critères des fiches. Le nom, le CIN et les dimensions s’appliquent aussi aux données Paie;
le statut courant ne filtre pas les mouvements historiques. Les embauches récentes sont comprises entre la date du jour
excluant la borne d’un an auparavant et incluant aujourd’hui; une embauche future n’est pas une embauche des douze derniers mois.

### 11.3. Règles et accès

- CIN obligatoire, unique après retrait des espaces extérieurs et sans distinction de casse; nom, dates et fonction obligatoires.
- Date de naissance strictement antérieure à aujourd’hui, en saisie comme en import.
- Un employé « En poste » possède un chantier et peut avoir une équipe; un employé « Sorti » ne garde aucune affectation courante.
- Salaire et type se renseignent ensemble; la paie reste masquée sans `PAIE_READ`.
- Un employé lié à un bulletin ou à un compte utilisateur ne peut pas être supprimé. La sortie conserve son historique.
- Lecture, écriture, suppression et import suivent respectivement `EMPLOYEE_READ`, `EMPLOYEE_WRITE`, `EMPLOYEE_DELETE` et `EMPLOYEE_IMPORT`.
  Les sélecteurs du formulaire demandent les droits de lecture des référentiels; l’historique exige `AUDIT_READ`.

### 11.4. Vérifications et décisions attendues

| Règle ou parcours | Preuve de contrôle | Accord métier |
|---|---|---|
| CIN, références, version et suppression protégée | `EmployeeServiceTest`, `EmployeeSuppressionTest`, `EmployeeControllerTest` | À recueillir |
| Import atomique, date de naissance et numéros Excel | `EmployeeImportServiceTest` | À recueillir |
| Agrégats et bornes des embauches sur douze mois | `EmployeeAnalytiqueServiceTest` sur PostgreSQL | À recueillir |
| Formulaire, fiche, filtres, erreur et réessai | Specs du domaine Employé et parcours navigateur | À recueillir |
| Historique distinct de l’état courant | Contrats Employé/Paie et scénarios de parcours | À recueillir |

Les résultats techniques de livraison sont consignés dans les rapports de contrôle. Ils ne valent pas un accord des
intervenants sur les règles ou le rendu. Le propriétaire relit ce bloc et le document complet avant diffusion;
accords, réserves, rejets et signatures suivent le modèle de la section 8.

## 12. Cinquième bloc — domaine Paie

### 12.1 Rôle et liens avec l’application

La Paie conserve les bulletins mensuels : un employé possède au plus un bulletin par mois. Les affectations
Fonction, Chantier et Équipe sont celles du bulletin de ce mois. La fiche Employé décrit le dernier état importé;
elle ne remplace pas ces affectations historiques. Les montants sont saisis ou importés, sans recalcul du total.

### 12.2 Parcours, indicateurs et accès

| Parcours | Fonctionnement actuel |
|---|---|
| Tabulaire | Recherche par nom, CIN, période et rattachements multiples; tri, colonnes configurables et pagination. Une erreur de chargement se distingue d'une liste vide et propose une reprise. |
| Cartes | Mois → chantier → équipe → fonction → employés; les filtres de l'URL sont conservés. Les cartes comparent le même groupe au mois civil précédent. Les bulletins sans équipe restent visibles. |
| Analytique | Masse et STC en DH, effectifs et STC en personnes, évolutions, répartitions et qualité des rattachements. Les tendances d'effectifs appliquent aussi les recherches nom/CIN et les rattachements choisis. |
| Création et modification | Employé et période immuables après création; l'équipe choisie est également inscrite sur la fiche d'un employé en poste. Les états d'attente et d'erreur empêchent de modifier un bulletin qui n'a pas été chargé. |
| Import | Contrôle du fichier, résolution des écarts, confirmation des départs puis import atomique; seul le mois suivant le dernier est accepté, sauf première importation. |
| Suppression | Unitaire avec `PAIE_DELETE`; en groupe avec `PAIE_PURGE`, période obligatoire et nombre de bulletins confirmé; restauration auditée distincte avec `PAIE_RESTORE`. |

La lecture exige `PAIE_READ`. La saisie exige `PAIE_WRITE` et `EMPLOYEE_WRITE`; les références nécessitent leurs droits
de lecture. L'analyse d'import exige `PAIE_IMPORT` et `PAIE_READ`; les corrections de fiches demandent aussi
`EMPLOYEE_WRITE`. Les exports demandent `PAIE_EXPORT`. Le catalogue des routes est dans le dossier Paie.

### 12.3 Règles appliquées et limites

- Un même employé et un même mois ne peuvent pas apparaître deux fois, y compris lors de créations concurrentes.
- Les nombres sont positifs ou nuls, avec deux décimales au plus : jours jusqu'à 999,99, montants jusqu'à
  99 999 999,99. Le contrôle du fichier applique les mêmes bornes; un salaire nul dans le fichier reste une erreur.
- L'observation est facultative et limitée à 255 caractères; l'équipe, les récupérations et primes restent facultatives.
- Les cellules numériques invalides sont refusées, même facultatives; les numéros annoncés correspondent aux lignes Excel.
- Les indicateurs mensuels, les tendances et le détail utilisent leurs filtres de périmètre; un mois vide ne supprime
  pas l'historique disponible. La comparaison porte toujours sur le mois civil précédent.
- Aucun statut provisoire/validé ni calcul depuis le Pointage n'est actuellement appliqué.

### 12.4 Preuves et accords à recueillir

| Sujet | Preuve technique | Accord métier |
|---|---|---|
| Unicité, version et références | Tests PaieService, VersionOptimiste et sécurité des endpoints | À recueillir |
| Import, bornes et numéros de ligne | Tests LecteurFichierPaie, PaieImportService et PaieRequestValidation | À recueillir |
| Même périmètre pour les tendances | Tests PostgreSQL PaieRechercheJokers et PaieEffectifsService | À recueillir |
| Recherche et reprise après erreur | Specs Liste, Formulaire et Détail; parcours navigateur | À recueillir |

Les résultats de compilation, de tests, de navigateur et de livraison restent dans leurs rapports techniques;
ils ne remplacent pas l'accord des intervenants. Les règles détaillées, contrats et scénarios sont centralisés dans
[le dossier Paie](../paie/README.md).

## 13. Sixième bloc — domaine Rapport

### 13.1 Rôle et sources

Le domaine produit un rapport PDF partageable et un classeur Excel à partir des bulletins, sans les modifier.
Le PDF présente les indicateurs, graphiques et listes complètes; l'Excel fournit les feuilles opérationnelles.
La masse est la somme de `salaireTotal`, l'effectif est le nombre de bulletins du mois et les STC sont les lignes
dont l'observation est « STC » ou « sortie », sans tenir compte de la casse et des espaces autour.

### 13.2 Parcours et règles de restitution

L'assistant guide le choix du mois, du format, des marchés PDF, des équipes détaillées et des quantités de matériel,
puis présente un récapitulatif. Les équipes sont choisies explicitement par leur libellé. Un échec de chargement
demande une reprise avant la génération; changer de mois abandonne la recherche des marchés du mois précédent.

Le PDF porte la période et, s'il est filtré, des pages de périmètre complètes. Les KPI, listes, comparaisons et
évolutions utilisent les mêmes filtres de nom, CIN, fonction et marchés. La vue d'ensemble est optionnelle;
les chapitres chantier et le détail des employés restent présents. Chaque employé apparaît une seule fois dans le PDF,
dans son équipe détaillée ou dans le reste du chantier. Les pages et les grands tableaux sont découpés avant le rendu.

L'Excel conserve une feuille globale, les feuilles chantier et les feuilles d'équipes sélectionnées. Une exclusion
d'équipe dans une feuille chantier n'enlève ni sa feuille propre ni ses données de la feuille globale.
Les exports individuels des composants restent disponibles depuis les vues qui les proposent.

### 13.3 Accès, preuves et limites

`PAIE_EXPORT` autorise les deux documents et leur génération est auditée. L'assistant a aussi besoin de `PAIE_READ`
pour lire les mois, marchés et tableaux de matériel. Aucune donnée n'est exportée sur la base d'une pagination d'écran.

| Sujet | Preuve technique | Accord métier |
|---|---|---|
| Agrégats, STC et comparaisons | Tests PaieBiReportBuilder et PaieRechercheJokers | À recueillir |
| Détail complet, pagination et périmètre | Tests RapportPageModelBuilder et PaieReportHtmlPdfService, texte et rendu des graphiques | À recueillir |
| Feuilles et exclusions Excel | Tests PaieExportService | À recueillir |
| Parcours d'assistant, chargement et erreurs | Specs de l'assistant et de ses étapes; revue navigateur | À recueillir |

Le PDF et l'Excel gardent chacun leur contrat de sélection documenté. Les exports de graphique ou tableau isolé
complètent ces documents. Les règles, DTO et scénarios sont centralisés dans [le dossier Rapport](../report/README.md).
Le propriétaire relit ce bloc avant diffusion; les accords, réserves et signatures suivent la section 8.

## 14. Domaine Auth — comptes, rôles et sessions

### 14.1 Rôle et liens

Auth gère les identités de connexion, leurs sessions et leurs droits. Un compte peut être lié à un employé,
mais ce lien reste facultatif : gérer un compte n'est pas créer une fiche Employé. Les règles, le modèle,
les DTO et les scénarios sont centralisés dans [le dossier Auth](../auth/README.md).

### 14.2 Parcours et règles appliquées

| Parcours | Contenu et résultat attendu |
|---|---|
| Connexion et session | Mot de passe contrôlé sans révéler l'existence d'un compte ; jeton d'accès gardé en mémoire, session par cookie protégé, rotation à usage unique et déconnexion. |
| Récupération | Réponse générique à la demande de lien ; lien limité dans le temps, à usage unique ; mot de passe conforme avant consommation du lien et révocation des sessions. |
| Utilisateurs | Liste paginée et filtrable ; création, modification, activation/désactivation, lien Employé facultatif et réinitialisation du mot de passe. |
| Rôles et refus | Attribution de rôles ; permissions effectives égales à l'union des rôles moins les refus individuels. Une sélection partielle d'un domaine est visible dans le formulaire de rôle. |
| Erreurs de lecture et de sauvegarde | Réessai d'une lecture avant toute saisie incomplète ; une sauvegarde des refus échouée après celle du compte est annoncée et peut être terminée sans perdre la version courante. |

L'identifiant contient de 3 à 50 caractères et le nom d'un rôle de 2 à 50, après retrait des espaces extérieurs.
Identifiant, email et nom de rôle sont uniques sans casse. L'email ne dépasse pas 255 caractères ; la description
d'un rôle est facultative et limitée à 255 caractères. Les collections de rôles et de permissions contiennent
des identifiants positifs, non nuls et existants. Une version périmée refuse la modification.

Un compte se désactive, il ne se supprime pas. Un rôle attribué ne se supprime pas ; le rôle d'administration
conserve son nom et ses permissions. Un compte désactivé perd ses sessions de rafraîchissement. Le jeton d'accès
déjà émis reste valable jusqu'à son expiration, comme documenté dans le dossier Auth.

### 14.3 Autorisations et protections

`USER_MANAGE` permet d'administrer les comptes et de consulter les rôles et le catalogue nécessaires à leur
attribution. Créer, modifier ou supprimer un rôle demande `ROLE_MANAGE`. Le lien Employé se sélectionne avec
`EMPLOYEE_READ` ; sans cette lecture, le lien courant reste visible et conservé en lecture seule.

Les mots de passe et jetons ne figurent pas dans les réponses d'administration ni dans l'historique. Les refus
et actions de sécurité sont audités. Les règles de verrouillage temporaire et de durée des sessions sont celles
du dossier Auth ; aucune authentification multifacteur n'est actuellement proposée. Il n'existe pas d'import,
d'export ni d'indicateur Analytique propres aux comptes et rôles.

### 14.4 Preuves et accords à recueillir

| Sujet | Preuve technique | Accord métier |
|---|---|---|
| Droits par action et alternatives de lecture des rôles | `EndpointSecurityTest`, `JwtSecurityChainTest` | À recueillir |
| Types, tailles, normalisation et références invalides | `AuthRequestValidationTest` | À recueillir |
| Rotation, révocation, verrouillage et récupération | `AuthServiceTest`, `VerrouillageConnexionIntegrationTest` | À recueillir |
| Formulaires, erreurs/réessais et sauvegarde partielle | Specs Utilisateurs/Rôles et revue navigateur | À recueillir |

Les preuves techniques ne remplacent pas la validation du besoin d'accès par les responsables. Les accords,
réserves, rejets et signatures suivent le modèle de la section 8.

## 15. Domaine Paramètres

### 15.1 Rôle et liens

Paramètres gère les valeurs de fonctionnement que les personnes autorisées peuvent ajuster depuis le portail.
Le catalogue des clés, types et bornes est fixe ; seules les valeurs courantes se modifient. Les consommateurs
sont l'authentification, l'analytique Paie et la synchronisation des chantiers. Le
[dossier Paramètres](../parametre/README.md) centralise le catalogue, le modèle, les DTO et les scénarios.

### 15.2 Parcours et règles appliquées

| Parcours | Contenu et résultat attendu |
|---|---|
| Consultation | Catalogue, libellé, description, unité, valeur courante et bornes de saisie. |
| Modification | Sauvegarde indépendante de chaque ligne avec sa version ; les saisies des autres paramètres sont conservées. |
| Validation | Entier décimal dans les bornes inclusives, valeur non blanche et au plus 255 caractères ; expression cron validée par Spring. |
| Chargement et erreur | Chargement annoncé ; résultat vide distinct d'une lecture échouée ; réessai disponible. |

Il n'existe aucune création, suppression ni clé libre dans l'écran. Une clé obligatoire absente de la base
est une installation incomplète ; aucune valeur de repli ne masque le défaut. Une version périmée refuse la
modification. La valeur normalisée et son historique sont enregistrés ensemble ; les valeurs mémorisées par
le backend sont invalidées après validation de la transaction.

### 15.3 Autorisations, preuves et accords

`PARAMETRE_READ` ouvre la consultation et `PARAMETRE_WRITE` autorise la saisie et l'enregistrement. La politique
de mot de passe nécessaire aux écrans publics est exposée séparément, sans ouvrir le catalogue administratif.
Ce domaine ne possède ni import, export, Cartes ni Analytique propres.

| Sujet | Preuve technique | Accord métier |
|---|---|---|
| Types, bornes et normalisation | `CleParametreTest`, specs de saisie Paramètres | À recueillir |
| Valeur modifiée, lecture et trace d'audit | `ParametreServiceTest` | À recueillir |
| Lecture seule, chargement, erreur et réessai | Specs des paramètres et revue navigateur | À recueillir |
| Accès lecture/écriture distincts | `EndpointSecurityTest` | À recueillir |

Les valeurs de fonctionnement et leurs limites restent celles du catalogue documenté. Les accords, réserves,
rejets et signatures suivent le modèle de la section 8.

## 16. Domaine Audit

### 16.1 Rôle et sources

Audit permet d'établir qui a fait quoi, quand, depuis quelle origine, avec quel résultat et sur quel périmètre.
Il distingue les instantanés de données, le journal d'actions et les garde-fous d'intégrité. Le
[dossier Audit](../audit/README.md) centralise leurs règles, modèle, contrats de consultation et scénarios.

### 16.2 Parcours et règles appliquées

| Parcours | Contenu et résultat attendu |
|---|---|
| Journal | Liste paginée, triée et filtrable par dates, utilisateur, catégories, actions, résultat, types d'entités et identifiant de requête. Un changement de filtre revient à la première page. |
| Entrée | Contexte et périmètre de l'action ; les différences d'une opération réussie se chargent à la demande, par pages. Une réponse tardive ne remplace pas l'entrée choisie ensuite. |
| Historique | Versions d'un enregistrement, de la plus récente à la plus ancienne ; avant/après des valeurs et ajouts/retraits de droits. |
| Erreur de consultation | Chargement et erreur annoncés ; réessai de la page en échec sans sauter de versions ni effacer celles déjà lues. |

Les horodatages sont conservés en UTC et affichés à l'heure de Casablanca. Les identités des acteurs restent
figées dans les traces. Aucun mot de passe ni jeton n'est conservé. Le journal et les versions restent immuables
pour l'application ; aucune route ne permet leur modification ou suppression. Les règles de conservation
déjà documentées sont conservées : journal et instantanés à vie, journaux SQL selon leur politique distincte.

### 16.3 Accès et liens avec Paie

Toutes les consultations demandent `AUDIT_READ`, distinct des permissions des écrans métier. Les traces peuvent
contenir des données personnelles et des montants ; cette permission est nécessaire même si la personne dispose
d'un autre droit de lecture. Le journal ne propose ni import, export ni vue Analytique.

Le bouton de restauration d'un groupe supprimé appelle le domaine Paie avec `PAIE_RESTORE`. Il ne réécrit pas
la trace source ; Paie vérifie les références et les conflits, puis recrée les bulletins atomiquement avec de
nouveaux identifiants et une nouvelle trace. La chaîne locale d'empreintes n'est pas une preuve indépendante
d'un superutilisateur de la base ; les limites d'exploitation restent explicites dans le dossier Audit.

### 16.4 Preuves et accords à recueillir

| Sujet | Preuve technique | Accord métier |
|---|---|---|
| Auteur, origine, commit/rollback et événements de sécurité | Tests AuditRevision, AuditOperation et AuditSecurityEvents | À recueillir |
| Consultation, pagination, données historiques et droits SQL | Tests AuditConsultation et AuditIntegrite | À recueillir |
| Journal, filtres, réponses tardives et réessais | Specs Journal et AuditHistorique ; revue navigateur | À recueillir |
| Restauration distincte et atomique | Tests de restauration Paie et permissions d'accès | À recueillir |

Une preuve locale ou un contrôle automatisé ne confirme pas l'activation des protections sur le serveur de
production. Les accords, réserves, rejets et signatures suivent le modèle de la section 8 ; le propriétaire
valide le document complet avant diffusion.

## 17. Blocs suivants

Les domaines et sujets restants seront ajoutés après le bloc Équipe, selon le même format : description compréhensible, règles, liens entre domaines, accès, vérifications, exceptions, décisions attendues et signatures. Le présent PV ne préjuge ni du contenu ni de l’accord de ces blocs.

### Évolution proposée — équipe obligatoire sur chaque bulletin

Aujourd'hui, l'équipe reste facultative sur un bulletin. Pour mieux maîtriser et organiser les ressources humaines, il est proposé de rendre l'équipe obligatoire dans une évolution ultérieure. Il s'agit uniquement d'une proposition : la règle actuelle et le code ne changent pas. Avant toute mise en œuvre, il faudra décider comment traiter les bulletins existants qui n'ont pas d'équipe.

À chaque ajout, le propriétaire relira et validera la version complète avant sa transmission aux intervenants. La version finale conservera la trace des accords, réserves, rejets, décisions et exceptions acceptées.
