---
name: tableur
description: "Construire un classeur Excel riche à télécharger : plusieurs feuilles, formules, mise en forme, tableaux, mise en forme conditionnelle et graphiques."
metadata:
  include_tools: create_workbook write_range format_range set_table create_chart add_conditional_format export_workbook
---
# tableur

Cette compétence construit un classeur Excel étape par étape, puis le rend téléchargeable depuis l'espace de fichiers de l'utilisateur. Elle ne lit aucune donnée de l'ERP : pour un chiffre, un nom ou une période, appelle d'abord l'outil du domaine concerné.

## Règles

- Chaque valeur écrite dans une cellule vient d'un résultat d'outil ou de ce que l'utilisateur a dit. N'invente rien, ne calcule rien toi-même : un total, une moyenne ou un pourcentage s'écrit comme une formule (`=SUM(B2:B9)`), que le tableur calcule.
- Le paramètre `path` est seulement un nom court de classeur (`paie_octobre`, sans dossier ni extension) : le même nom désigne le même classeur pendant toute la demande.
- Si la demande est ambiguë et que le choix change le résultat (colonnes, période, type de graphique), pose la question avec `poser_question` plutôt que de deviner.
- Quand `export_workbook` répond « Fichier prêt », dis simplement que le fichier est prêt dans l'espace de fichiers. Ne donne aucun chemin ni lien. Si un outil échoue, dis que le fichier n'a pas pu être créé, sans détail technique.
- Tu ne peux ni envoyer le fichier par e-mail ni le publier ailleurs.

## Ordre des appels

1. `create_workbook` avec le nom du classeur et les noms des feuilles (`overwrite` à vrai pour repartir d'un classeur vide).
2. `write_range` : l'en-tête et les lignes à partir d'une cellule (`A1`), une feuille à la fois.
3. Si utile : `format_range` (gras, formats de nombre et de date, couleurs), `set_table` (plage en tableau avec filtres), `add_conditional_format` (mise en évidence), `create_chart` (graphique à partir d'une plage de la feuille).
4. `export_workbook` en dernier : sans lui, rien n'est téléchargeable.

Appelle ensemble les outils qui ne dépendent pas l'un de l'autre (deux feuilles à remplir, deux graphiques).
