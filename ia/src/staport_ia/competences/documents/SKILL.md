---
name: documents
description: "Créer un document Word, un PDF, une présentation PowerPoint ou un tableau Excel simple à télécharger (note, compte rendu, courrier, rapport, diaporama)."
metadata:
  include_tools: create_word_from_markdown create_pdf_from_markdown create_powerpoint_presentation list_presentation_templates create_excel_from_markdown
---
# documents

Cette compétence produit un fichier que l'utilisateur télécharge avec un bouton affiché dans la discussion. Elle ne lit aucune donnée de l'ERP : pour un chiffre, un nom ou une période, appelle d'abord l'outil du domaine concerné.

## Règles

- Chaque valeur écrite dans le document (montant, effectif, date, nom) vient d'un résultat d'outil ou de ce que l'utilisateur a dit. N'invente rien, ne calcule rien toi-même. Dans un tableau Excel, un total ou un pourcentage s'écrit comme une formule du tableur, pas comme un nombre calculé par toi.
- Si le format n'est pas précisé et que le choix change le résultat, pose la question avec `poser_question` (Word, PDF, PowerPoint ou Excel) au lieu de deviner. Si l'utilisateur demande plusieurs formats, crée-les l'un après l'autre.
- Les textes du document sont en français, les montants en MAD.
- Quand l'outil répond « Fichier prêt », dis simplement que le fichier est prêt et qu'il le télécharge avec le bouton. Ne donne aucun chemin, aucun lien et ne recopie pas le contenu du fichier.
- Si l'outil renvoie des `warnings`, corrige le texte concerné et rappelle l'outil une seule fois. Si l'outil échoue, dis que le fichier n'a pas pu être créé, sans détail technique.
- Tu ne peux ni envoyer le fichier par e-mail ni le publier ailleurs.

## Quel outil

- Note, compte rendu, courrier, rapport : `create_word_from_markdown`. Le texte est en Markdown (titres, listes, tableaux, citations) ; sépare chaque bloc par une ligne vide.
- PDF (document à imprimer ou à envoyer tel quel) : `create_pdf_from_markdown`, avec un titre, du Markdown sans HTML ni image et un nom de fichier court.
- Diaporama : `create_powerpoint_presentation`. Une diapositive par idée : une diapositive de titre, puis des diapositives de contenu courtes (quelques puces), des tableaux ou des graphiques pour les valeurs que les outils ont données. `list_presentation_templates` ne sert que si l'utilisateur demande un modèle précis.
- Tableau Excel simple (une ou plusieurs feuilles, formules de total) : `create_excel_from_markdown`. Pour des graphiques, une mise en forme poussée ou beaucoup de données, utilise la compétence `tableur`.
- Donne au fichier un nom court et parlant (`file_name`), sans extension ni dossier.
