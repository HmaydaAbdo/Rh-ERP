---
name: paie-bulletins-rapports
description: "Bulletins de paie individuels (recherche), vue de la paie dans la conversation, préparation du rapport de paie et du classeur Excel à télécharger."
metadata:
  include_tools: paie_bulletins_rechercher paie_afficher_vue rapport_preparer paie_export_preparer
---
# paie-bulletins-rapports

Pour un salarié nommé, résous d'abord son identifiant avec la compétence `employes`. `rapport_preparer` ne génère pas le fichier : il prépare les données du rapport. Pour un classeur Excel de paie à télécharger, appelle `paie_export_preparer` : il rend une référence de téléchargement (5 minutes) que l'interface transforme en bouton ; ne recopie jamais la référence dans ta réponse et dis seulement que le fichier est prêt à télécharger.

Pour que l'utilisateur voie, consulte ou parcoure la paie (« montre-moi la paie d'octobre pour NADOR »), appelle `paie_afficher_vue` : l'interface affiche la vraie vue de la paie, filtres compris, que l'utilisateur manipule lui-même sans te redemander. Résous d'abord les chantiers nommés avec `chantier_rechercher`. Annonce le mois et le nombre de bulletins rendus, sans recopier de ligne ; ne dis jamais avoir réglé un filtre de la page.
