# Procès-verbal de cadrage et de validation — stabilisation d’ERP-RH

**Date de préparation :** 22 octobre 2026  
**Objet :** trajectoire de stabilisation de toute l’application ERP-RH  
**Blocs examinés :** Équipe (premier), Fonction (deuxième), Chantier (troisième)  
**Version stable visée :** `1.0.0` pour le frontend et le backend  
**État du document :** projet interne à valider par le propriétaire avant toute transmission aux intervenants. Il ne constate pas encore un accord collectif.

> **Règle de lecture :** ce document sépare les règles et faits déjà vérifiés, les décisions proposées aux intervenants, les sujets encore ouverts et les preuves de réalisation. Une décision ne sera qualifiée d’« accord collectif » qu’après validation explicite des personnes concernées. Une réserve ou un rejet restera visible dans le compte rendu.

## 1. Objet du PV

Ce PV définit le cadre commun pour faire évoluer ERP-RH de sa version actuelle vers une application stable, compréhensible et vérifiable par ses utilisateurs et ses responsables métier.

Le travail couvrira progressivement toute l’application, domaine par domaine. **Le présent PV ouvre le premier bloc, consacré au domaine Équipe, puis un deuxième, consacré au domaine Fonction, et un troisième, consacré au domaine Chantier.** Les autres domaines seront ajoutés dans des blocs ultérieurs, après examen de leurs règles, de leurs liens avec les autres domaines, de leurs écrans, de leurs accès et de leurs preuves de contrôle. Leur accord n’est donc pas présumé par ce document.

La version stable `1.0.0` sera annoncée lorsque les blocs prévus auront été examinés, que les décisions requises auront été enregistrées et que les contrôles de livraison applicables auront réussi.

## 2. Principes communs soumis à accord

Les principes suivants forment le cadre proposé pour tous les futurs blocs :

1. **Chaque domaine est décrit avant sa modification.** Le dossier expose le rôle du domaine, ses données, ses règles, ses liens avec les autres domaines, ses accès, ses parcours et ses limites connues.
2. **Les règles sont dites clairement.** Chaque règle métier est formulée en langage compréhensible, avec des exemples utiles et le résultat attendu lorsque la règle est respectée ou non.
3. **Toute règle importante est vérifiée.** Les contrôles doivent couvrir le cas normal, les limites, les erreurs, les droits d’accès et les interactions entre domaines concernées. Les résultats et les éventuels échecs sont présentés sans les masquer.
4. **Une exception est examinée, pas dissimulée.** Elle indique la règle concernée, la raison, les personnes et données touchées, le risque, la mesure temporaire, la personne responsable et la date de réexamen. Elle ne devient une décision qu’après approbation explicite.
5. **Les trois vues forment le modèle de consultation de tous les domaines.** Tabulaire pour retrouver et comparer; **Cartes par descente libre** pour parcourir (on choisit soi-même par quoi regrouper — chantier, équipe, fonction, puis les employés — et chaque carte ouverte devient une étape du fil); **Analytique graphique** pour comprendre les volumes et leur évolution (paie et fiches Employé). Les filtres propres au domaine agissent de la même façon dans les trois vues et leurs valeurs suivent quand on passe de l’une à l’autre. Les cinq domaines (Paie, Employés, Équipes, Fonctions, Chantiers) utilisent les mêmes composants, inscrits dans les conventions (décision du propriétaire du 23 octobre 2026, ADR 0011).
6. **Les droits restent attachés aux données de leur domaine.** Une vue qui rassemble plusieurs domaines n’élargit pas les accès. Elle présente chaque information seulement aux personnes habilitées pour cette information.
7. **Une proposition n’est pas un accord.** Les faits vérifiés, décisions déjà approuvées, propositions, points ouverts, réserves et rejets sont identifiés séparément.
8. **Aucun document de décision n’est diffusé sans validation du propriétaire.** Avant transmission aux intervenants, le propriétaire reçoit la version complète, avec les faits, règles, risques, décisions attendues et preuves disponibles, puis valide explicitement sa diffusion.

## 3. Premier bloc — domaine Équipe

### 3.1 Rôle du domaine et liens avec l’application

Le référentiel Équipe fournit le code et le libellé utilisés pour rattacher des personnes et des bulletins de paie à une équipe. Pour que le module soit utile au métier, ses vues relient donc trois informations différentes :

- **Référentiel Équipe :** les équipes connues de l’application, chacune avec un code et un libellé.
- **Situation Employé :** l’équipe enregistrée sur la fiche Employé au dernier mois de paie importé. Elle décrit la situation la plus récente connue dans cette fiche.
- **Historique Paie :** l’équipe portée par chaque bulletin de sa période. Cet historique permet de consulter les indicateurs d’un mois donné même si la situation Employé a changé ensuite.

La situation Employé récente et l’historique Paie sont deux informations distinctes. Elles ne doivent pas être présentées comme si elles décrivaient la même période.

### 3.2 Parcours et contenu attendus

Les personnes autorisées doivent pouvoir consulter le référentiel dans les trois vues :

| Vue | Contenu attendu |
|---|---|
| **Tabulaire** | Liste paginée des équipes, recherche par code ou libellé, consultation et actions permises. |
| **Cartes** | Une carte par équipe, puis regroupement libre par chantier, fonction ou employés; sur chaque carte, l’effectif des fiches Employé récentes et la paie du mois avec l’écart sur le mois précédent lorsque la personne a accès à ces domaines. |
| **Analytique** | Graphiques : choix d’une période Paie, indicateurs et leur variation, évolution mensuelle, répartition par une autre dimension (un clic approfondit), tranches, mouvements, et situation des fiches Employé. Les équipes sans bulletin durant la période restent visibles. |

Les filtres utiles restent présents lorsqu’on change de vue. La période et l’équipe sélectionnées dans l’Analytique peuvent être conservées dans l’adresse de la page afin de permettre de retrouver le même affichage.

### 3.3 Indicateurs Paie

Pour la période consultée, les indicateurs retenus pour ce premier bloc sont :

- masse salariale;
- effectif payé;
- coût moyen par personne;
- nombre et montant des soldes de tout compte (STC);
- nombre de chantiers concernés;
- évolution mensuelle de la masse, de l’effectif payé et des STC pour une équipe sélectionnée.

Les définitions et calculs déjà utilisés dans le domaine Paie font référence. La période est affichée à côté des chiffres. Un résultat égal à zéro signifie qu’aucun bulletin n’est compté pour ce périmètre et cette période; une information réellement indisponible doit être signalée comme telle.

### 3.4 Règles de saisie et de validation déjà appliquées

Le formulaire présente les règles avant la saisie et explique comment corriger une erreur.

| Champ | Règle à respecter | Résultat attendu |
|---|---|---|
| **Code** | Obligatoire, au plus 50 caractères, unique; les espaces en début et en fin sont retirés; le code est enregistré en majuscules. | Enregistrement accepté si la valeur est correcte. En cas de doublon ou de valeur invalide, l’enregistrement est refusé avec une explication compréhensible et le champ à corriger. |
| **Libellé** | Obligatoire, au plus 100 caractères, unique; les espaces en début et en fin sont retirés. | Enregistrement accepté si la valeur est correcte. En cas de doublon ou de valeur invalide, l’enregistrement est refusé avec une explication compréhensible et le champ à corriger. |

Un test de validation ne se limite pas à constater un refus : il doit aussi confirmer que la personne comprend la règle en cause et sait quelle action entreprendre. Les contrôles techniques peuvent détailler le diagnostic; les messages destinés aux utilisateurs restent en langage métier.

### 3.5 Accès aux informations

Les droits applicatifs déjà en place s’appliquent séparément :

- l’accès au référentiel et aux vues Équipe dépend de l’autorisation de consulter les équipes;
- l’effectif et les informations issues des fiches Employé ne sont affichés qu’aux personnes autorisées à consulter les employés;
- les indicateurs et montants Paie ne sont affichés qu’aux personnes autorisées à consulter la Paie.

Le fait d’avoir accès à un écran Équipe n’accorde pas, à lui seul, l’accès aux montants Paie ou aux informations Employé.

### 3.6 Modifications, suppression et cycle de vie

Les comportements suivants sont constatés dans la version actuelle et doivent être examinés par les intervenants avant de les considérer comme les règles métier finales :

- modifier le libellé change le nom affiché par l’application et les documents qui reprennent ce nom;
- modifier le code change le code consulté sur les bulletins historiques qui pointent vers cette équipe;
- supprimer une équipe référencée par une fiche Employé ou un bulletin est actuellement refusé;
- le référentiel ne comporte pas de statut « active » ou « inactive ».

**Aucun nouveau statut, archivage ou comportement de remplacement n’est décidé dans ce PV.** Le comportement d’une équipe utilisée doit être confirmé avant toute modification à cette règle. Les anciennes données ne sont pas réécrites par le présent bloc.

Les libellés `A`, `LABO`, `ASPHALET` et `8` ont été initialisés provisoirement à la même valeur que leur code. Ils ne portent aucune signification de statut. Leur signification et leur libellé doivent être confirmés par la RH.

## 4. État de réalisation du premier bloc

Les trois vues Équipe et leur liaison aux données Employé et Paie sont **fusionnées dans la branche principale** (PR #77, 23 octobre 2026) avec une intégration continue verte (backend, frontend, profil de performance, parcours complet navigateur + base). Les vues Cartes et Analytique y ont ensuite été remplacées par les **composants partagés par les cinq modules** (ADR 0011) : cette évolution est dans la PR #80, **pas encore fusionnée**, et ses contrôles complets sont à confirmer. Cette version n’est pas déclarée en production et n’a pas encore reçu l’accord métier final.

Les contrôles couvrent les règles de ce PV et leurs résultats doivent être examinés avant la signature. Un contrôle en cours, une vérification locale isolée ou un résultat technique seul ne prouve pas que toutes les règles de ce PV sont respectées.

Les documents de suivi du bloc sont disponibles pour le propriétaire et seront actualisés avant validation de la version destinée aux intervenants :

- [Description du module Équipe](../equipe/README.md)
- [Conventions de vérification](../../conventions/testing.md)

## 5. Tableau de vérification avant accord

Chaque règle présentée aux intervenants doit avoir une preuve compréhensible. Les preuves peuvent être un test automatisé, une vérification de parcours dans l’application, un exemple contrôlé ou une décision écrite de la personne métier responsable, selon la nature de la règle.

| Sujet à vérifier | Preuve attendue | État avant signature |
|---|---|---|
| Trois vues et filtres conservés | Parcours des trois vues, avec filtres et retour à la même sélection | Vert en CI pour la version fusionnée (PR #77); version partagée (PR #80) à confirmer en CI, puis revue des intervenants |
| Situation Employé distincte de l’historique Paie | Exemple avec changement d’équipe entre deux mois, vérifié sur les deux affichages | À confirmer |
| Indicateurs Paie et période affichée | Valeurs comparées à des exemples Paie vérifiés, y compris une équipe sans bulletin sur le mois | À confirmer |
| Accès par domaine | Essai avec un compte autorisé et un compte non autorisé pour Employé et Paie | À confirmer |
| Code et libellé | Cas valides, doublons, champs vides, espaces extérieurs et limites de longueur | Tests automatisés verts en CI; messages à confirmer avec les intervenants |
| Modification du code et historique | Décision écrite sur l’effet visible dans les bulletins historiques | Décision des intervenants attendue |
| Suppression d’une équipe utilisée | Confirmation du refus actuel ou décision signée sur un autre comportement | Décision des intervenants attendue |
| Quatre libellés provisoires | Signification et libellé confirmés ou action attribuée avec échéance | Réponse RH attendue |

Le statut « À confirmer » ne signifie pas que le contrôle a échoué ou réussi : il signifie que la preuve n’a pas encore été examinée pour l’accord du présent PV.

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

### Décisions déjà approuvées par le propriétaire pour le cadrage

- Stabiliser ERP-RH domaine par domaine, avec Équipe comme premier bloc.
- Viser `1.0.0` pour le frontend et le backend lorsque les critères de stabilité sont satisfaits.
- Appliquer un modèle commun de trois vues aux domaines concernés, avec un contenu adapté à chaque métier.
- Pour Équipe et Fonction, distinguer la situation Employé la plus récente de l’historique mensuel Paie.
- Pour les cinq domaines (Paie, Employés, Équipes, Fonctions, Chantiers) : Cartes par descente libre, Analytique graphique (paie et fiches Employé), mêmes composants partagés, pattern inscrit dans `conventions/frontend.md` (23 octobre 2026).
- Pour Chantier, conserver la modification actuelle du code (code modifié partout, historique compris) (23 octobre 2026).
- Pour Fonction, conserver le renommage actuel (libellé modifié partout, historique compris) et le refus de suppression d’une fonction utilisée (23 octobre 2026).
- Garder les droits Employé, Paie et Équipe séparés.
- Expliquer les validations et les erreurs aux utilisateurs en langage simple.
- Obtenir l’accord du propriétaire sur la version complète du PV avant toute transmission aux intervenants.

Ces décisions cadrent le travail; elles ne signifient pas que les intervenants métier ont déjà signé leur accord.

### Accords métier à recueillir pour le bloc Équipe

Chaque intervenant indique son avis, les réserves éventuelles et les corrections demandées. Les points non concernés peuvent être marqués « sans objet » avec une explication.

| Décision attendue | Accord | Réserve ou rejet et motif |
|---|---|---|
| Les trois vues et leur contenu représentent correctement le besoin Équipe. | À compléter | À compléter |
| Les indicateurs Paie listés en section 3.3 sont ceux attendus pour la consultation par équipe. | À compléter | À compléter |
| La fiche Employé exprime la situation la plus récente connue, distincte des anciens bulletins. | À compléter | À compléter |
| Le comportement actuel de modification du code dans l’historique est accepté ou doit évoluer. | À compléter | À compléter |
| Le refus de suppression d’une équipe encore utilisée est accepté ou doit évoluer. | À compléter | À compléter |
| Les libellés `A`, `LABO`, `ASPHALET` et `8` sont compris et une action de clarification est attribuée. | À compléter | À compléter |

## 8. Compte rendu de signature

**Résultat collectif du bloc Équipe :** à renseigner après réception de tous les avis : `Accepté` / `Accepté avec réserves` / `À corriger et représenter` / `Rejeté`.

Un résultat collectif n’est renseigné comme accepté que si les personnes concernées ont donné leur avis et que les réserves bloquantes ont été levées ou explicitement traitées selon la section 6. Les avis individuels restent conservés même en cas de désaccord.

| Intervenant et rôle | Avis (accord / réserve / rejet) | Commentaire ou décision associée | Signature | Date |
|---|---|---|---|---|
| Propriétaire de l’application | À compléter après revue du présent projet |  |  |  |
| Responsable métier Équipe / RH | À compléter |  |  |  |
| Responsable métier Paie | À compléter |  |  |  |
| Responsable de réalisation / livraison | À compléter |  |  |  |
| Autre intervenant concerné | À compléter |  |  |  |

## 9. Deuxième bloc — domaine Fonction

**État du bloc :** fusionné dans la branche principale le 23 octobre 2026 (PR #79, intégration continue verte), non déclaré en production et sans accord métier; ses vues Cartes et Analytique sont remplacées par les composants partagés dans la PR #80, non encore fusionnée. Ce bloc applique au domaine Fonction le cadre des sections 2 et 6 et le modèle de trois vues du bloc Équipe. Tout ce qui suit est un projet à valider par le propriétaire avant transmission aux intervenants.

### 9.1 Rôle du domaine et liens avec l’application

Le référentiel Fonction fournit le libellé du poste occupé. Il relie trois informations distinctes :

- **Référentiel Fonction :** les fonctions connues, chacune avec un libellé.
- **Situation Employé :** la fonction enregistrée sur la fiche Employé au dernier mois de paie importé.
- **Historique Paie :** la fonction portée par chaque bulletin de sa période, qui reste lisible même si la fiche Employé change ensuite.

Comme pour Équipe, la situation Employé récente et l’historique Paie ne sont jamais présentés comme décrivant la même période.

### 9.2 Parcours, indicateurs et accès

| Vue | Contenu |
|---|---|
| **Tabulaire** | Liste paginée, recherche par libellé, consultation, modification et suppression selon les droits; import Excel et création dans l’en-tête commun. |
| **Cartes** | Une carte par fonction, puis regroupement libre par chantier, équipe ou employés; fiches Employé et paie du mois sur chaque carte. |
| **Analytique** | Graphiques : indicateurs de la période (STC compris dans la répartition), évolution mensuelle, répartition (les fonctions sans bulletin restent visibles), tranches, mouvements, et fiches Employé. |

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
| Trois vues et filtre conservé | Parcours des trois vues avec le même filtre dans l’adresse | Vert en CI pour la version fusionnée (PR #79); version partagée (PR #80) à confirmer en CI |
| Situation Employé distincte de l’historique Paie | Exemple avec changement de fonction entre deux mois | À confirmer |
| Indicateurs Paie et mois sans bulletin | Valeurs comparées à des exemples Paie vérifiés; fonction sans bulletin sur le mois choisi | Cas du mois sans bulletin couvert par test; valeurs à comparer |
| Accès par domaine | Essai avec un compte autorisé et un compte privé de `EMPLOYEE_READ` et `PAIE_READ` | Couvert par tests, vert en CI pour la version fusionnée (PR #79); version partagée (PR #80) à confirmer en CI |
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

**État du bloc :** version de travail réalisée le 23 octobre 2026 dans la PR #80 (intégration continue en cours, pas encore fusionnée), non déclarée en production et sans accord métier. Ce bloc applique au domaine Chantier le cadre des sections 2 et 6 et le modèle de trois vues des blocs Équipe et Fonction. Tout ce qui suit est un projet à valider par le propriétaire avant transmission aux intervenants.

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
| **Cartes** | Une carte par chantier avec son statut, puis regroupement libre par équipe, fonction ou employés; fiches Employé et paie du mois sur chaque carte. |
| **Analytique** | Graphiques : indicateurs de la période, évolution mensuelle, répartition par chantier (STC compris; les chantiers sans bulletin restent visibles), tranches, mouvements, et fiches Employé. |

Les indicateurs sont ceux de la section 3.3 (pour un chantier sélectionné, le nombre de chantiers concernés n’est pas répété) et la répartition indique le nombre et le montant des soldes de tout compte de chaque chantier. Les filtres par code, désignation et statut agissent de la même façon dans les trois vues. Les droits restent séparés : `CHANTIER_READ` pour le référentiel, `EMPLOYEE_READ` pour les effectifs des fiches, `PAIE_READ` pour les indicateurs et montants Paie.

### 10.3 Règles déjà appliquées et constats

- le code et la désignation sont obligatoires à la création manuelle; le code est unique sans tenir compte de la casse ni des espaces extérieurs;
- la synchronisation avec l’ERP n’ajoute que les chantiers manquants : elle ne modifie, ne clôture ni ne supprime jamais un chantier existant;
- clôturer un chantier ne le supprime pas : il reste consultable et référencé par l’historique, mais n’est plus accepté par l’import des employés et l’assistant d’import de la paie propose de le rouvrir (décision du propriétaire du 19 octobre 2026);
- supprimer un chantier référencé par une fiche Employé ou un bulletin est refusé; la clôture est l’alternative;
- modifier le code d’un chantier le change pour tous les bulletins et fiches qui le référencent, historique compris : **décision du propriétaire du 23 octobre 2026, ce comportement est conservé**, c’est le moyen de corriger une faute de saisie.

**Aucune règle nouvelle n’est introduite par ce bloc.** Hors de ce bloc, le doublon apparent du chantier `C157A` reste suivi dans le [TODO](../../TODO.md).

### 10.4 Preuves et accords à recueillir

| Sujet à vérifier | Preuve attendue | État avant signature |
|---|---|---|
| Trois vues et filtres conservés | Parcours des trois vues avec les mêmes filtres dans l’adresse | Tests unitaires et E2E locaux réussis; parcours intégré à confirmer en CI |
| Situation Employé distincte de l’historique Paie | Exemple avec changement de chantier entre deux mois | À confirmer |
| Indicateurs Paie et mois sans bulletin | Valeurs comparées à des exemples Paie vérifiés; chantier sans bulletin sur le mois choisi | Cas du mois sans bulletin couvert par test; valeurs à comparer |
| Accès par domaine | Essai avec un compte autorisé et un compte privé de `EMPLOYEE_READ` et `PAIE_READ` | Couvert par tests; parcours intégré à confirmer en CI |
| Statut En cours / Clôturé | Filtre par statut, clôture et réouverture avec confirmation | Couvert par tests |
| Modification du code d’un chantier utilisé | Décision du propriétaire (comportement actuel conservé) et avis écrit des intervenants | Décision du propriétaire prise le 23 octobre 2026; avis des intervenants attendu |

| Décision attendue | Accord | Réserve ou rejet et motif |
|---|---|---|
| Les trois vues et leur contenu représentent correctement le besoin Chantier. | À compléter | À compléter |
| Les indicateurs Paie de la section 10.2 sont ceux attendus, STC compris dans la répartition par chantier. | À compléter | À compléter |
| La modification du code d’un chantier utilisé change le code partout, historique compris (décision du propriétaire). | À compléter | À compléter |

Les signatures de ce bloc seront recueillies sur le modèle de la section 8.

## 11. Blocs suivants

Les domaines et sujets restants seront ajoutés après le bloc Équipe, selon le même format : description compréhensible, règles, liens entre domaines, accès, vérifications, exceptions, décisions attendues et signatures. Le présent PV ne préjuge ni du contenu ni de l’accord de ces blocs.

À chaque ajout, le propriétaire relira et validera la version complète avant sa transmission aux intervenants. La version finale conservera la trace des accords, réserves, rejets, décisions et exceptions acceptées.
