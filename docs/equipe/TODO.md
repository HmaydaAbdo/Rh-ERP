# TODO — domaine Équipe

Ce fichier est la liste de suivi canonique du domaine Équipe. Les points ci-dessous sont
ouverts ou doivent être examinés avec leurs responsables métier. Le statut technique ne vaut pas
accord métier. Le détail fonctionnel et technique de référence se trouve dans le
[README Équipe](README.md), et le suivi de validation/signature dans [Validation Équipe](validation.md).

## Décisions et validations métier

- [ ] Confirmer auprès de la RH la signification et le libellé des codes provisoires `A`, `LABO`,
  `ASPHALET` et `8` (le libellé actuel est identique au code).
- [ ] Décider si l'équipe peut rester facultative sur un bulletin (`paie.equipe_id` nullable).
- [ ] Confirmer que modifier le code d'une équipe doit aussi changer le code affiché pour les
  bulletins historiques qui référencent cette même équipe.
- [ ] Confirmer que la suppression d'une équipe référencée par un bulletin ou une fiche Employé
  doit rester bloquée.
- [ ] Examiner avec RH/Paie le contenu des trois vues, les indicateurs et les exemples de calcul;
  distinguer explicitement la situation Employé la plus récente des bulletins de chaque période.
- [ ] Recueillir et consigner les avis du propriétaire, du responsable métier Équipe/RH, du
  responsable Paie et du responsable réalisation/livraison dans [Validation Équipe](validation.md).

## Vérifications opérationnelles

- [ ] Rejouer les parcours Équipe avec les intervenants métier et enregistrer les exemples,
  résultats, réserves et décisions dans [Validation Équipe](validation.md).
- [ ] Confirmer la CI du commit `main` examiné avant la revue propriétaire; consigner le SHA et
  les contrôles terminés, distinctement des vérifications locales.
- [ ] Maintenir le statut de déploiement séparé : le dossier n'affirme pas une mise en production
  sans preuve opérationnelle.

## Périmètre

- Pas d'import Excel ni de synchronisation du référentiel Équipe : la gestion se fait par l'écran
  Équipes.
- Aucun statut actif/inactif ou archivage n'est prévu dans le comportement actuel.
- Toute tâche nouvelle propre à Équipe est ajoutée ici; le `TODO.md` racine ne porte que le suivi
  transversal et renvoie vers ce fichier.
