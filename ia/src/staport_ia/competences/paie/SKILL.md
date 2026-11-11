---
name: paie
description: "Paie : montant de la paie, sortants et STC, indicateurs, évolution, comparaison de mois, répartition par chantier ou fonction, mouvements d'effectif, qualité des données de paie."
metadata:
  include_tools: paie_indicateurs paie_periodes paie_repartition paie_evolution paie_comparer paie_mouvements paie_qualite
---
# paie

Les montants sont en dirhams (MAD). Le mois par défaut est le dernier mois de paie importé. Commence par `paie_periodes` seulement si la question porte sur les mois disponibles. Les écarts, totaux et rangs viennent de `paie_comparer`, `paie_evolution` et `paie_repartition`, jamais d'un calcul du modèle.

Pour un chantier, une équipe ou une fonction cités par leur nom, lis d'abord `/referentiels/SKILL.md` : les outils de paie demandent des identifiants.
