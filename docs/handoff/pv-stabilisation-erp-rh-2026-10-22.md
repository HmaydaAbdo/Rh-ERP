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
5. **Les trois vues forment le modèle de consultation de tous les domaines.** Tabulaire pour retrouver et comparer; **Cartes par descente libre** pour parcourir (on choisit soi-même par quoi regrouper — chantier, équipe, fonction, puis les employés — et chaque carte ouverte devient une étape du fil); **Analytique graphique** pour comprendre les volumes et leur évolution (paie et fiches Employé). Les filtres propres au domaine agissent de la même façon dans les trois vues et leurs valeurs suivent quand on passe de l’une à l’autre. Les cinq domaines (Paie, Employés, Équipes, Fonctions, Chantiers) utilisent Cartes et Analytique partagées (ADR 0011), ainsi que la coque et la vue Tabulaire configurables `app-collection-shell` et `app-collection-table` (ADR 0012, décision du propriétaire du 23 octobre 2026).
6. **Les droits restent attachés aux données de leur domaine.** Une vue qui rassemble plusieurs domaines n’élargit pas les accès. Elle présente chaque information seulement aux personnes habilitées pour cette information.
7. **Une proposition n’est pas un accord.** Les faits vérifiés, décisions déjà approuvées, propositions, points ouverts, réserves et rejets sont identifiés séparément.
8. **Aucun document de décision n’est diffusé sans validation du propriétaire.** Avant transmission aux intervenants, le propriétaire reçoit la version complète, avec les faits, règles, risques, décisions attendues et preuves disponibles, puis valide explicitement sa diffusion.

## 3. Premier bloc — domaine Équipe

Le domaine Équipe est le premier domaine soumis à revue. Son rôle, les règles constatées, les vues,
les liens Employé/Paie, les API, les droits, les vérifications, les décisions attendues et les avis
sont centralisés dans le [dossier Équipe](../equipe/README.md) et sa [fiche de validation](../equipe/validation.md).
Ces documents constituent la source de revue du domaine et évoluent avec le code.

Les décisions du propriétaire du 23 octobre 2026 sont consignées dans la fiche de validation : le code renommé suit
l'équipe référencée jusque dans les bulletins historiques, une équipe référencée par Paie ou Employé ne peut pas être
supprimée, et le rattachement d'équipe reste facultatif sur les bulletins actuels.

## 4. État de réalisation du premier bloc

Le partage des vues et de la coque est fusionné dans `main` par squash de la PR #80 au commit
`c0ecbe5f9d718b079a486b8b8514ae7197ae8b8b`. La CI #391 est verte sur la tête de PR `3e2058b`
(frontend, backend, full-stack et profil de performance; publication d'images ignorée). Le statut
combiné des contrôles attachés au commit de fusion n'est pas disponible dans le présent dossier;
il doit être vérifié sur le SHA `main` retenu avant la revue propriétaire. La version n'est pas
présentée comme déployée en production et l'accord métier reste à recueillir selon la fiche de
validation Équipe.

L'import Excel Équipe et la migration V32 sont présents dans le travail local sur `main` : compilation
backend, 28 tests backend ciblés, 29 tests frontend Équipe et 3 E2E Équipe réussis. Le changement
reste à pousser; aucune preuve CI ni de déploiement n'est attribuée à l'import.

La revue propriétaire suit l'ordre global : **Équipe → Fonction → Chantier → Employé → Paie**.
Cet ordre n'établit ni accord métier ni validation de production.

## 5. Source des preuves Équipe

Les critères et preuves d'examen Équipe sont tenus dans [Validation Équipe](../equipe/validation.md).
La description de l'implémentation, de ses contrats et de ses tests est tenue dans le [README Équipe](../equipe/README.md).
Aucune table de critères Équipe n'est recopiée dans le PV global.
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

Les décisions de cadrage communes restent dans le présent PV. Les décisions et avis propres au
bloc Équipe sont centralisés dans [Validation Équipe](../equipe/validation.md). Un cadrage ou une
proposition n'est pas une signature.

## 8. Compte rendu de signature

Le résultat collectif du bloc Équipe et les avis individuels seront consignés dans
[Validation Équipe](../equipe/validation.md). Aucun accord n'est présumé avant que les intervenants
concernés aient donné leur avis et que les réserves bloquantes soient traitées selon la section 6.
## 9. Deuxième bloc — domaine Fonction

**État du bloc :** fusionné dans la branche principale (PR #79), puis porté par les composants partagés fusionnés dans `main` via PR #80. La CI #391 est verte sur la tête de PR #80 `3e2058b`; les statuts du commit de fusion sont à vérifier avant la revue propriétaire. Le domaine n’est pas déclaré en production et n’a pas reçu l’accord métier. Ce bloc applique le cadre commun des sections 2 et 6. Tout ce qui suit est un projet à valider par le propriétaire avant transmission aux intervenants.

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
| Trois vues et filtre conservé | Parcours des trois vues avec le même filtre dans l’adresse | CI #391 verte sur la tête de PR #80 `3e2058b`; statut du commit de fusion à vérifier, revue métier attendue |
| Situation Employé distincte de l’historique Paie | Exemple avec changement de fonction entre deux mois | À confirmer |
| Indicateurs Paie et mois sans bulletin | Valeurs comparées à des exemples Paie vérifiés; fonction sans bulletin sur le mois choisi | Cas du mois sans bulletin couvert par test; valeurs à comparer |
| Accès par domaine | Essai avec un compte autorisé et un compte privé de `EMPLOYEE_READ` et `PAIE_READ` | Tests et parcours intégré couverts; CI #391 verte sur la tête de PR #80; validation métier des intervenants attendue |
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

**État du bloc :** version de travail fusionnée dans `main` par PR #80 (squash `c0ecbe5`). La CI #391 est verte sur la tête de PR `3e2058b`; le statut du commit de fusion reste à vérifier. Le domaine n’est pas déclaré en production et n’a pas reçu l’accord métier. Ce bloc applique le cadre commun des sections 2 et 6. Les règles ci-dessous restent à valider par le propriétaire avant transmission aux intervenants.

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
| Trois vues et filtres conservés | Parcours des trois vues avec les mêmes filtres dans l’adresse | Tests frontend et E2E locaux réussis; CI #391 verte sur la tête de PR #80 `3e2058b`; statut du commit de fusion à vérifier |
| Situation Employé distincte de l’historique Paie | Exemple avec changement de chantier entre deux mois | À confirmer |
| Indicateurs Paie et mois sans bulletin | Valeurs comparées à des exemples Paie vérifiés; chantier sans bulletin sur le mois choisi | Cas du mois sans bulletin couvert par test; valeurs à comparer |
| Accès par domaine | Essai avec un compte autorisé et un compte privé de `EMPLOYEE_READ` et `PAIE_READ` | Tests et parcours intégré couverts; CI #391 verte sur la tête de PR #80; validation métier à recueillir |
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

### Évolution proposée — équipe obligatoire sur chaque bulletin

L'équipe reste facultative sur un bulletin dans le fonctionnement actuel. Pour améliorer l'organisation des ressources, il est proposé d'en faire une donnée obligatoire dans une évolution ultérieure. Cette proposition n'est pas une règle appliquée et n'autorise aucune modification de code ou de données à ce stade. Une décision ultérieure devra traiter les bulletins existants sans équipe avant tout changement technique.

À chaque ajout, le propriétaire relira et validera la version complète avant sa transmission aux intervenants. La version finale conservera la trace des accords, réserves, rejets, décisions et exceptions acceptées.
