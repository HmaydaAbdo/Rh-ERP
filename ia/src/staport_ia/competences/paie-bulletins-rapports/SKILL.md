---
name: paie-bulletins-rapports
description: "Bulletins de paie individuels (recherche), préparation du rapport de paie et du classeur Excel à télécharger."
metadata:
  include_tools: paie_bulletins_rechercher rapport_preparer paie_export_preparer
---
# paie-bulletins-rapports

Pour un salarié nommé, résous d'abord son identifiant avec la compétence `employes`. `rapport_preparer` ne génère pas le fichier : il prépare les données du rapport. Pour un classeur Excel de paie à télécharger, appelle `paie_export_preparer` : il rend une référence de téléchargement (5 minutes) que l'interface transforme en bouton ; ne recopie jamais la référence dans ta réponse et dis seulement que le fichier est prêt à télécharger.
