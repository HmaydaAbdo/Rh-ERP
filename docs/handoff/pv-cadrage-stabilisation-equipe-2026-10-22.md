# Première version du PV — stabilisation ERP-RH

**Date :** 22 octobre 2026  
**Sujet de départ :** le module Équipe  
**Version stable visée :** 1.0.0 pour l’application

## Pourquoi ce travail ?

ERP-RH évolue d’une première version vers une application stable, cohérente et compréhensible par ses utilisateurs. Le travail commence par les équipes de travail, puis sera repris domaine par domaine.

Chaque domaine devra proposer trois façons de consulter ses informations :

- **Tabulaire** : retrouver et comparer des lignes;
- **Cartes** : parcourir les éléments visuellement;
- **Analytique** : comprendre les volumes et leur évolution.

Le même repère de navigation sera utilisé dans l’application. Le contenu restera adapté à chaque métier.

## Ce que le module Équipe doit montrer

Une équipe ne sert pas seulement à remplir une liste. Elle relie le référentiel des équipes aux fiches des employés et aux bulletins de paie.

- **Employés** : la fiche d’un employé indique l’équipe du dernier mois de paie importé. Ce chiffre représente la situation la plus récente connue.
- **Paie** : chaque bulletin garde l’équipe qui lui était associée ce mois-là. Cela permet de consulter l’historique même si la situation évolue ensuite.
- **Référentiel** : chaque équipe a un code et un libellé. Il n’existe pas aujourd’hui de statut « active » ou « inactive ».

Les vues distingueront clairement la situation la plus récente de l’historique. Les chiffres de paie, notamment les montants, ne seront visibles qu’aux personnes autorisées à consulter la paie. Les informations des employés et celles des équipes suivront également leurs droits d’accès habituels.

## Règles de saisie, en langage utilisateur

Les règles ci-dessous sont déjà appliquées lors de l’enregistrement. Le formulaire les explique près de chaque champ, avant la saisie.

| Champ | Ce que l’utilisateur doit savoir |
|---|---|
| **Code** | Obligatoire, 50 caractères maximum et unique. Les espaces au début et à la fin sont retirés. Le code est enregistré en majuscules. Il sert à reconnaître l’équipe dans les fichiers de paie. |
| **Libellé** | Obligatoire, 100 caractères maximum et unique. Les espaces au début et à la fin sont retirés. |

Si un code ou un libellé existe déjà, l’enregistrement est refusé afin d’éviter deux équipes identiques. Les messages affichés doivent expliquer quoi corriger, sans exposer le fonctionnement interne de l’application.

## Ce qui se passe quand une équipe est modifiée ou supprimée

- **Modifier le libellé** change le nom affiché dans l’application et les documents qui reprennent ce nom.
- **Modifier le code** change le code associé à l’équipe, y compris lorsqu’on consulte d’anciens bulletins. Ce point doit être confirmé avec la RH avant de retenir définitivement ce comportement.
- **Supprimer une équipe utilisée** est actuellement refusé lorsqu’un employé ou un bulletin de paie y fait référence.
- Le parcours de retrait d’une équipe utilisée reste à décider : conserver la règle actuelle ou définir une autre façon de la retirer. Aucune règle « active / inactive » n’est ajoutée sans décision métier.

## Décisions déjà prises

- Le travail commence par Équipe, puis continuera avec Chantier et Fonction.
- Le frontend suit un modèle commun de trois vues : Tabulaire, Cartes et Analytique.
- Les vues Équipe présenteront séparément le nombre d’employés rattachés au dernier mois importé et l’historique des indicateurs Paie par mois. Cela évite de confondre la situation la plus récente avec les anciennes périodes.
- Chaque partie respecte les droits habituels : les informations d’employés et les chiffres de paie ne s’affichent qu’aux personnes autorisées pour ces domaines.
- La version stable visée est `1.0.0` pour le frontend et le backend. Elle sera annoncée quand les critères de stabilité seront atteints.
- Les libellés provisoires `A`, `LABO`, `ASPHALET` et `8` doivent être clarifiés par la RH. Ils ne représentent pas un statut d’équipe.

## Indicateurs Paie retenus

Pour une période choisie, le module Équipe présentera la masse salariale, l’effectif payé, le coût moyen par personne, le nombre et le montant des soldes de tout compte (STC), ainsi que le nombre de chantiers. L’historique montrera l’évolution mensuelle de la masse, de l’effectif et des STC.

Les définitions déjà utilisées dans la Paie seront conservées. La période et la source seront toujours visibles. Une donnée absente sera présentée comme indisponible, sans la remplacer par un zéro trompeur.

## Points métier encore ouverts

Les questions suivantes n’ont pas encore reçu de réponse et ne changent pas les règles actuelles :

- Le code et le libellé suffisent-ils pour décrire une équipe ?
- Faut-il conserver le comportement actuel où le nouveau code est aussi affiché quand on consulte les anciens bulletins ?
- La suppression doit-elle rester bloquée tant qu’un employé ou un bulletin fait référence à l’équipe ?
- Quand la RH pourra-t-elle confirmer les quatre libellés provisoires mentionnés plus haut ?

La maquette de travail est disponible ici : [maquette des trois vues Équipe](maquette-equipe-vues.html). Elle illustre le contenu attendu; ses chiffres sont fictifs et ne proviennent pas de la base de données.

## Suite convenue

Le travail commence par le module Équipe, puis la même démarche sera appliquée à Chantier et Fonction. Les questions métier encore ouvertes seront décidées avant de modifier les comportements concernés.

La convention de navigation figure dans [`conventions/frontend.md`](../../conventions/frontend.md). La description actuelle du module est dans [`docs/equipe/README.md`](../equipe/README.md), et les sujets encore ouverts sont suivis dans [`TODO.md`](../../TODO.md).

## Première livraison

Les trois vues Équipe sont maintenant réalisées : le tableau conserve ses filtres, les cartes montrent le référentiel avec les chiffres autorisés, et l'Analytique relie les équipes aux indicateurs Paie par période et à l'état Employé le plus récent. Une équipe sans bulletin sur le mois choisi reste visible dans la répartition. Les chiffres des deux domaines restent séparés et suivent les accès déjà en place.

La compilation de l'application frontend a réussi. La vérification complète des tests attend le résultat de la CI : l'environnement de travail local ne dispose pas du navigateur requis pour exécuter les tests d'interface.
