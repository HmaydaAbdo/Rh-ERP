# ADR 0010 — La fiche employé porte l'état du dernier mois de paie

- **Statut** : accepté
- **Date** : 2026-10-18
- **Décideur** : propriétaire du projet

## Contexte

Les Employés doivent avoir, comme la Paie, une vue Tabulaire, des Cartes et une Analytique, ainsi qu'une fiche qui retrace
le parcours de chaque employé. La table `employe` ne gardait aucun historique (ni départ, ni mutation), et elle divergeait
de la paie : en 2026-09, 366 fiches avaient un autre chantier et 36 une autre fonction que leur bulletin du mois ; 6 844
employés étaient ACTIF alors que 1 009 seulement étaient payés, et 5 748 n'avaient jamais eu de bulletin.

Chaque bulletin fige déjà la fonction, le chantier, l'équipe et le salaire du mois (voir docs/paie/README.md, « Pourquoi
fonction/chantier/équipe sont dupliqués »). L'historique d'un employé existe donc déjà : dans ses bulletins.

## Décision

1. **La fiche employé représente l'état courant dérivé du dernier mois de paie enregistré** : nom, CIN, fonction,
   affectations courantes, **salaire** et **type de salaire** (mensuel, ou tarif d'une journée). Un employé `ACTIF` a un
   chantier; l'équipe est facultative. Un employé `INACTIF` n'a ni chantier ni équipe courants. Salaire et type restent
   nullables lorsqu'aucune paie ne les a renseignés.
2. **L'historique est calculé à partir des bulletins**, jamais recopié dans une seconde table : une copie finirait par
   diverger. Les modifications faites à l'écran restent tracées par l'audit (Envers).
3. **Les départs sont la seule donnée nouvelle** : table `employe_sortie` (employé, mois, motif « STC » ou saisi), un
   départ par mois au plus. Elle garde chaque départ, même quand l'employé revient puis repart.
4. **Le statut suit la paie** : ACTIF si l'employé est payé au dernier mois importé sans STC ; INACTIF sinon (STC, ou absent
   du fichier et départ confirmé par l'utilisateur).
5. **L'import de la paie aligne la base** (lot 3, assistant) : un import ne se termine que si le fichier et les fiches
   concordent ; les écarts se corrigent dans l'assistant (mettre à jour la fiche) ou dans le fichier, puis on réimporte.
   Seul le mois qui suit exactement le dernier mois importé est accepté.
6. **Le salaire et son type sont des données de paie** : sans `PAIE_READ`, l'API ne les renvoie pas, ignore ceux qu'on
   saisit, et ne trie pas par salaire. Le masquage est fait au contrôleur, pour que les autres domaines lisent le vrai
   salaire par `IEmployeeService`.
7. **Une seule source pour les indicateurs Équipe** : les Cartes et l'Analytique Équipe calculent leurs effectifs depuis
   les bulletins du dernier mois enregistré. Les effectifs courants des fiches Employé ne sont pas mélangés à ces mesures.
8. **Un employé inactif n'a pas d'affectation courante** : à la sortie, `chantier_id` et `equipe_id` sont vidés. La paie
   conserve les affectations historiques de chaque bulletin. Au retour via l'import, la fiche redevient active avec le
   chantier et l'équipe de la ligne du mois importé.

### Reprise des données existantes (migration V30, auditée)

Décidée par le propriétaire le 2026-10-18 :

- chaque fiche payée reprend l'état de **son dernier bulletin** ; le salaire vient du dernier bulletin non nul, son type est
  déduit du montant (≤ 200 : tarif journalier, sinon mensuel — aucun salaire n'est compris entre 200 et 2 500 dans les
  données) ;
- un bulletin « STC » ou « sortie » devient un départ de ce mois ; un employé absent du dernier mois a un départ le mois qui
  suit son dernier bulletin ;
- **les employés sans aucun bulletin sont supprimés** (5 748 en développement), sauf s'ils sont liés à un compte
  utilisateur (alors INACTIF, départ « Aucune paie (reprise) ») ;
- sans aucune paie en base (installation neuve), la reprise ne fait rien.

Résultat sur les données de développement : 957 ACTIF, 139 INACTIF, 145 départs, 5 748 suppressions ; la chaîne
d'intégrité du journal d'audit reste valide.

## Conséquences

- Une seule source pour l'historique (la paie) ; les vues Cartes et Analytique des employés peuvent montrer des tendances
  mois par mois (effectif, entrées, sorties, mutations).
- L'import de la paie devient plus exigeant : un fichier qui contredit les fiches ne passe plus sans décision.
- Supprimer le dernier mois de paie ne remet pas les fiches dans leur état antérieur : elles gardent leurs valeurs.
- Les données d'audit d'un employé (bouton « Historique », `AUDIT_READ`) montrent aussi ses changements de salaire, comme
  celles d'un bulletin.
