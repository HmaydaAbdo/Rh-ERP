# Validation métier et technique — domaine Équipe

Ce document centralise la partie Équipe du PV de stabilisation. Le PV global fixe le cadre commun
et renvoie ici pour éviter deux descriptions concurrentes. Les faits de code, règles détaillées,
API, écrans, droits et tests sont décrits dans le [README Équipe](README.md); les actions ouvertes
sont suivies dans [TODO Équipe](TODO.md).

## Objet de la revue

Le référentiel fournit les codes et libellés d'équipe utilisés par les bulletins de paie et les
fiches Employé. La revue examine les trois vues, les règles de saisie, les accès séparés, le lien
avec les périodes Paie et le traitement des équipes encore référencées. La situation Employé la
plus récente et l'historique Paie par période doivent rester deux informations distinctes.

## État technique documenté

La livraison des vues partagées est sur `main` au commit `c0ecbe5f9d718b079a486b8b8514ae7197ae8b8b`
(fusion squash de la PR #80). La PR #80 rapporte CI #391 verte sur sa tête `3e2058b` (frontend,
backend, full-stack et profil de performance; publication d'images ignorée). Les statuts enregistrés
pour le commit de fusion ne sont pas disponibles dans le présent dossier; le statut combiné GitHub
renvoie actuellement une liste vide. Le TODO demande de vérifier les contrôles sur le SHA `main`
examiné avant de signer.

Cette preuve de CI ne démontre ni l'accord métier ni une mise en production. Le statut de déploiement
reste non confirmé dans ce dossier.

## Points soumis à validation

| Sujet | Preuve ou décision attendue | État |
|---|---|---|
| Trois vues, filtres et parcours | Parcours Tabulaire, Cartes, Analytique et retour à la même sélection | À examiner avec les intervenants |
| Situation Employé et historique Paie | Exemple où l'équipe change entre deux périodes, vérifié sur les deux affichages | À confirmer |
| Indicateurs Paie et période | Comparaison à des exemples Paie vérifiés, y compris une équipe sans bulletin durant le mois | À confirmer |
| Accès par domaine | Essai autorisé/interdit pour les informations Employé et Paie | Couvert par tests; validation métier attendue |
| Code et libellé | Valeurs valides, doublons, champs vides, espaces extérieurs et limites de longueur | Couvert techniquement; messages à examiner |
| Modification du code et historique | Décision écrite sur le changement visible dans les anciens bulletins | À confirmer |
| Suppression d'une équipe utilisée | Accord sur le refus de suppression lorsque Paie ou Employé la référence | À confirmer |
| Codes provisoires | Sens et libellé de `A`, `LABO`, `ASPHALET` et `8` confirmés ou action RH attribuée | À confirmer |
| Équipe facultative sur bulletin | Décision sur le maintien de `equipe_id` nullable | À confirmer |

Une preuve technique indique qu'un contrôle a été exécuté. Elle ne remplace pas l'examen métier du
résultat. « À confirmer » ne signifie ni échec ni réussite.

## Décisions de cadrage déjà approuvées

- Examiner ERP-RH domaine par domaine, avec Équipe en premier.
- Distinguer la situation Employé la plus récente des informations Paie historiques par période.
- Garder distincts les droits Équipe, Employé et Paie; la présence d'une information dans une vue
  Équipe ne confère pas son autorisation.
- Appliquer aux cinq domaines concernés les vues et composants partagés décrits dans
  [l'architecture des vues](../frontend/vues-perimetre.md) et les ADR 0011/0012.
- Garder toute décision métier proposée séparée d'un accord explicite des intervenants.

Ces décisions de cadrage ne valent pas signature du besoin métier Équipe.

## Avis et signatures

| Intervenant | Avis | Commentaire, signature et date |
|---|---|---|
| Propriétaire de l'application | À compléter après revue | |
| Responsable métier Équipe / RH | À compléter | |
| Responsable métier Paie | À compléter | |
| Responsable réalisation / livraison | À compléter | |
| Autre intervenant concerné | À compléter | |

**Résultat collectif :** à renseigner après réception des avis : `Accepté` / `Accepté avec réserves` /
`À corriger et représenter` / `Rejeté`.

Toute exception reste visible et décrit la règle concernée, la portée, les utilisateurs et données
touchés, le risque, la mesure temporaire, le responsable, l'échéance de réexamen et l'approbation
explicite. Une exception n'est pas appliquée avant approbation.
