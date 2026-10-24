# PV N°1 — Cadrage et évolutions d’ERP-RH

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
5. **Les trois vues de collection sont partagées entre les domaines.** Tabulaire sert à retrouver et comparer. Cartes suit la hiérarchie fixe déclarée par le domaine; chaque ouverture avance d'une étape et ajoute son groupe au fil. Analytique présente les indicateurs et graphiques propres au sujet du domaine, dans l'ordre de priorité déclaré par sa configuration. Les filtres métier restent cohérents entre les vues. Paie, Employés, Équipes, Fonctions et Chantiers utilisent les composants partagés Cartes et Analytique (ADR 0011, 0014), ainsi que la coque et le Tabulaire configurables (ADR 0012).
6. **Les droits restent attachés aux données de leur domaine.** Une vue qui rassemble plusieurs domaines n’élargit pas les accès. Elle présente chaque information seulement aux personnes habilitées pour cette information.
7. **Une proposition n’est pas un accord.** Les faits vérifiés, décisions déjà approuvées, propositions, points ouverts, réserves et rejets sont identifiés séparément.
8. **Aucun document de décision n’est diffusé sans validation du propriétaire.** Avant transmission aux intervenants, le propriétaire reçoit la version complète, avec les faits, règles, risques, décisions attendues et preuves disponibles, puis valide explicitement sa diffusion.

## 3. Premier bloc — domaine Équipe

Le domaine Équipe est le premier domaine examiné. Son rôle, les règles, les vues, les liens Employé/Paie,
les API, les droits et les scénarios de test sont centralisés dans le [dossier Équipe](../equipe/README.md),
qui évolue avec le comportement de l'application.

Les règles et scénarios actuellement appliqués sont centralisés dans le [README Équipe](../equipe/README.md) :
le code modifié est affiché dans les bulletins historiques qui référencent l'équipe; la suppression d'une équipe référencée
par Paie ou Employé est bloquée; le rattachement d'équipe reste facultatif sur les bulletins.
La fiche Employé porte l'affectation courante de l'employé, dont son équipe; chaque bulletin conserve
séparément l'équipe associée à son mois. Un changement d'affectation sur la fiche n'altère pas les
bulletins antérieurs. Dans le formulaire Paie, l'équipe choisie pour un bulletin est aussi enregistrée
sur la fiche Employé dans la même transaction; les créations/modifications manuelles exigent donc les
droits Paie et Employé correspondants. Les règles détaillées et leurs tests restent dans les README
Employé, Équipe et Paie.

## 4. État de réalisation du premier bloc

Les vues métier utilisent la coque et le Tabulaire configurables partagés, ainsi que les vues Cartes
et Analytique partagées décrites dans les ADR 0011, 0012 et 0014. L'import Excel du référentiel est livré avec
la migration V32. Les scénarios de code, interface, autorisations et parcours sont décrits dans le
README Équipe, qui donne aussi les commandes et résultats locaux à jour.

La revue propriétaire suit l'ordre global : **Équipe → Fonction → Chantier → Employé → Paie**.
Cet ordre n'établit ni accord métier ni validation de production.

Dans les Cartes Équipe, les quatre mesures Paie du dernier mois enregistré sont présentées séparément,
avec leur valeur et leur comparaison au mois calendaire précédent. Les règles de comparaison et les cas
où elle est indisponible sont détaillés dans le README Équipe.

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

Comme pour Équipe, la situation Employé récente et l’historique Paie ne sont jamais présentés comme décrivant la même période.

### 9.2 Parcours, indicateurs et accès

| Vue | Contenu |
|---|---|
| **Tabulaire** | Liste paginée, recherche par libellé, consultation, modification et suppression selon les droits; import Excel et création dans l’en-tête commun. |
| **Cartes** | Parcours fonction → chantier → équipe → employés; chaque étape conserve les fiches Employé et les indicateurs Paie du mois. |
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
| **Cartes** | Parcours chantier → équipe → fonction → employés; statut du chantier, fiches Employé et indicateurs Paie du mois. |
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

## 11. Blocs suivants

Les domaines et sujets restants seront ajoutés après le bloc Équipe, selon le même format : description compréhensible, règles, liens entre domaines, accès, vérifications, exceptions, décisions attendues et signatures. Le présent PV ne préjuge ni du contenu ni de l’accord de ces blocs.

### Évolution proposée — équipe obligatoire sur chaque bulletin

Aujourd'hui, l'équipe reste facultative sur un bulletin. Pour mieux maîtriser et organiser les ressources humaines, il est proposé de rendre l'équipe obligatoire dans une évolution ultérieure. Il s'agit uniquement d'une proposition : la règle actuelle et le code ne changent pas. Avant toute mise en œuvre, il faudra décider comment traiter les bulletins existants qui n'ont pas d'équipe.

À chaque ajout, le propriétaire relira et validera la version complète avant sa transmission aux intervenants. La version finale conservera la trace des accords, réserves, rejets, décisions et exceptions acceptées.
