---
name: employes
description: "Employés : recherche par nom ou code, fiche, effectif, regroupement, sorties, parcours professionnel et chantiers successifs."
metadata:
  include_tools: employes_rechercher employe_fiche employes_compter employes_regrouper employes_sorties employe_parcours
---
# employes

Pour une personne citée par son nom, appelle `employes_rechercher` avant `employe_fiche` ou `employe_parcours`, qui demandent un identifiant numérique.

Pour un chantier, une équipe ou une fonction cités par leur nom, lis `/referentiels/SKILL.md` afin d'obtenir leurs identifiants.
