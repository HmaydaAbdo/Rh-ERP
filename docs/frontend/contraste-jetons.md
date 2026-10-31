# Contrastes des jetons de design

Rapport généré par `npm run check:contraste` (script `scripts/check-contraste-jetons.mjs`) à partir de `frontend/src/styles/_tokens.scss`. Formule de contraste de WCAG 2.2 (critère 1.4.3). Seuils : texte courant 7:1 (AAA), texte secondaire, libellés de boutons et liens 4,5:1 (AA), bordures franches, anneau de focus, composants et éléments graphiques 3:1 (1.4.11), séparateur de ligne de tableau 2,18:1 (charte). Les couples marqués « informatif » ne bloquent pas le contrôle.

## Thème clair

| Couple | Premier plan | Arrière-plan | Contraste | Seuil | Résultat |
|---|---|---|---|---|---|
| Texte sur canvas | `--color-text` #111827 | `--color-canvas` #f3f4f6 | 16,12:1 | 7:1 | OK |
| Texte secondaire sur canvas | `--color-text-muted` #4b5563 | `--color-canvas` #f3f4f6 | 6,87:1 | 4,5:1 | OK |
| Texte sur surface | `--color-text` #111827 | `--color-surface` #ffffff | 17,74:1 | 7:1 | OK |
| Texte secondaire sur surface | `--color-text-muted` #4b5563 | `--color-surface` #ffffff | 7,56:1 | 4,5:1 | OK |
| Texte sur surface-alt | `--color-text` #111827 | `--color-surface-alt` #f4f5f7 | 16,26:1 | 7:1 | OK |
| Texte secondaire sur surface-alt | `--color-text-muted` #4b5563 | `--color-surface-alt` #f4f5f7 | 6,93:1 | 4,5:1 | OK |
| Texte sur surface-sunken | `--color-text` #111827 | `--color-surface-sunken` #e5e7eb | 14,33:1 | 7:1 | OK |
| Texte secondaire sur surface-sunken | `--color-text-muted` #4b5563 | `--color-surface-sunken` #e5e7eb | 6,10:1 | 4,5:1 | OK |
| Texte sur surface-hover | `--color-text` #111827 | `--color-surface-hover` #e8ebf0 | 14,84:1 | 7:1 | OK |
| Texte secondaire sur surface-hover | `--color-text-muted` #4b5563 | `--color-surface-hover` #e8ebf0 | 6,32:1 | 4,5:1 | OK |
| Lien sur surface | `--color-link` #1e40af | `--color-surface` #ffffff | 8,72:1 | 4,5:1 | OK |
| Lien sur fond de page | `--color-link` #1e40af | `--color-canvas` #f3f4f6 | 7,93:1 | 4,5:1 | OK |
| Texte fort sur action douce | `--color-primary-strong` #1e40af | `--color-primary-soft` #e3eafb | 7,24:1 | 7:1 | OK |
| Libellé de bouton principal | `--color-primary-contrast` #ffffff | `--color-primary` #1e40af | 8,72:1 | 4,5:1 | OK |
| Libellé de bouton principal au survol | `--color-primary-contrast` #ffffff | `--color-primary-hover` #1e3a8a | 10,36:1 | 4,5:1 | OK |
| Action sur surface | `--color-primary` #1e40af | `--color-surface` #ffffff | 8,72:1 | 3:1 | OK |
| Action sur fond de page | `--color-primary` #1e40af | `--color-canvas` #f3f4f6 | 7,93:1 | 3:1 | OK |
| Libellé du bouton de suppression | `--color-danger-contrast` #ffffff | `--color-danger` #7f1d1d | 10,02:1 | 4,5:1 | OK |
| Anneau de focus sur surface | `--color-focus` #1e40af | `--color-surface` #ffffff | 8,72:1 | 3:1 | OK |
| Anneau de focus sur fond de page | `--color-focus` #1e40af | `--color-canvas` #f3f4f6 | 7,93:1 | 3:1 | OK |
| Bordure franche sur surface | `--color-border-strong` #7f8796 | `--color-surface` #ffffff | 3,62:1 | 3:1 | OK |
| Bordure franche sur fond de page | `--color-border-strong` #7f8796 | `--color-canvas` #f3f4f6 | 3,29:1 | 3:1 | OK |
| Bordure de ligne sur surface | `--color-border` #a9b0bc | `--color-surface` #ffffff | 2,18:1 | 2,18:1 | OK |
| Bordure de ligne sur fond de page (informatif) | `--color-border` #a9b0bc | `--color-canvas` #f3f4f6 | 1,98:1 | 2,18:1 | sous le seuil, informatif |
| Rail : texte | `--color-sidebar-text` #d1d5db | `--color-sidebar-bg` #111827 | 12,04:1 | 7:1 | OK |
| Rail : texte au survol | `--color-sidebar-text` #d1d5db | `--color-sidebar-hover-bg` #1f2937 | 9,96:1 | 7:1 | OK |
| Rail : élément actif | `--color-sidebar-active-text` #ffffff | `--color-sidebar-active-bg` #2a3447 | 12,50:1 | 7:1 | OK |
| Carte : texte | `--map-ui-text` #f5f4ef | `--map-ui-surface` #2b2a28 | 13,02:1 | 7:1 | OK |
| Carte : texte secondaire | `--map-ui-text-muted` #bdbab1 | `--map-ui-surface` #2b2a28 | 7,39:1 | 4,5:1 | OK |
| Carte : icône | `--map-ui-icon` #eceae3 | `--map-ui-surface` #2b2a28 | 11,91:1 | 3:1 | OK |
| Carte : bordure | `--map-ui-border` #6b6962 | `--map-ui-surface` #2b2a28 | 2,61:1 | 2,18:1 | OK |
| Carte : infobulle | `--map-tooltip-text` #f5f4ef | `--map-tooltip-surface` #2b2a28 | 13,02:1 | 7:1 | OK |
| Statut success sur son fond teinté | `--color-success` #14532d | `--color-success-bg` #dcfce7 | 8,30:1 | 7:1 | OK |
| Statut success sur surface | `--color-success` #14532d | `--color-surface` #ffffff | 9,11:1 | 7:1 | OK |
| Statut warning sur son fond teinté | `--color-warning` #78350f | `--color-warning-bg` #fef3c7 | 8,15:1 | 7:1 | OK |
| Statut warning sur surface | `--color-warning` #78350f | `--color-surface` #ffffff | 9,07:1 | 7:1 | OK |
| Statut danger sur son fond teinté | `--color-danger` #7f1d1d | `--color-danger-bg` #fee2e2 | 8,20:1 | 7:1 | OK |
| Statut danger sur surface | `--color-danger` #7f1d1d | `--color-surface` #ffffff | 10,02:1 | 7:1 | OK |
| Statut info sur son fond teinté | `--color-info` #1e3a8a | `--color-info-bg` #dbe4fb | 8,14:1 | 7:1 | OK |
| Statut info sur surface | `--color-info` #1e3a8a | `--color-surface` #ffffff | 10,36:1 | 7:1 | OK |
| Graphique : série 1 sur surface (informatif) | `--chart-1` #256abf | `--color-surface` #ffffff | 5,39:1 | 3:1 | OK |
| Graphique : série 2 sur surface (informatif) | `--chart-2` #eb6834 | `--color-surface` #ffffff | 3,20:1 | 3:1 | OK |
| Graphique : série 3 sur surface (informatif) | `--chart-3` #1baf7a | `--color-surface` #ffffff | 2,82:1 | 3:1 | sous le seuil, informatif |
| Graphique : série 4 sur surface (informatif) | `--chart-4` #eda100 | `--color-surface` #ffffff | 2,17:1 | 3:1 | sous le seuil, informatif |
| Graphique : série 5 sur surface (informatif) | `--chart-5` #e87ba4 | `--color-surface` #ffffff | 2,69:1 | 3:1 | sous le seuil, informatif |
| Graphique : série 6 sur surface (informatif) | `--chart-6` #008300 | `--color-surface` #ffffff | 4,95:1 | 3:1 | OK |
| Graphique : série 7 sur surface (informatif) | `--chart-7` #4a3aa7 | `--color-surface` #ffffff | 8,56:1 | 3:1 | OK |
| Graphique : série 8 sur surface (informatif) | `--chart-8` #e34948 | `--color-surface` #ffffff | 3,95:1 | 3:1 | OK |

## Thème sombre

| Couple | Premier plan | Arrière-plan | Contraste | Seuil | Résultat |
|---|---|---|---|---|---|
| Texte sur canvas | `--color-text` #f5f4ef | `--color-canvas` #1f1e1d | 15,11:1 | 7:1 | OK |
| Texte secondaire sur canvas | `--color-text-muted` #bdbab1 | `--color-canvas` #1f1e1d | 8,58:1 | 4,5:1 | OK |
| Texte sur surface | `--color-text` #f5f4ef | `--color-surface` #2b2a28 | 13,02:1 | 7:1 | OK |
| Texte secondaire sur surface | `--color-text-muted` #bdbab1 | `--color-surface` #2b2a28 | 7,39:1 | 4,5:1 | OK |
| Texte sur surface-alt | `--color-text` #f5f4ef | `--color-surface-alt` #262523 | 13,91:1 | 7:1 | OK |
| Texte secondaire sur surface-alt | `--color-text-muted` #bdbab1 | `--color-surface-alt` #262523 | 7,89:1 | 4,5:1 | OK |
| Texte sur surface-sunken | `--color-text` #f5f4ef | `--color-surface-sunken` #353432 | 11,29:1 | 7:1 | OK |
| Texte secondaire sur surface-sunken | `--color-text-muted` #bdbab1 | `--color-surface-sunken` #353432 | 6,41:1 | 4,5:1 | OK |
| Texte sur surface-hover | `--color-text` #f5f4ef | `--color-surface-hover` #3a3937 | 10,48:1 | 7:1 | OK |
| Texte secondaire sur surface-hover | `--color-text-muted` #bdbab1 | `--color-surface-hover` #3a3937 | 5,95:1 | 4,5:1 | OK |
| Lien sur surface | `--color-link` #f5f4ef | `--color-surface` #2b2a28 | 13,02:1 | 4,5:1 | OK |
| Lien sur fond de page | `--color-link` #f5f4ef | `--color-canvas` #1f1e1d | 15,11:1 | 4,5:1 | OK |
| Texte fort sur action douce | `--color-primary-strong` #f5f4ef | `--color-primary-soft` #3a3937 | 10,48:1 | 7:1 | OK |
| Libellé de bouton principal | `--color-primary-contrast` #1f1e1d | `--color-primary` #eceae3 | 13,83:1 | 4,5:1 | OK |
| Libellé de bouton principal au survol | `--color-primary-contrast` #1f1e1d | `--color-primary-hover` #ffffff | 16,64:1 | 4,5:1 | OK |
| Action sur surface | `--color-primary` #eceae3 | `--color-surface` #2b2a28 | 11,91:1 | 3:1 | OK |
| Action sur fond de page | `--color-primary` #eceae3 | `--color-canvas` #1f1e1d | 13,83:1 | 3:1 | OK |
| Libellé du bouton de suppression | `--color-danger-contrast` #2a0a09 | `--color-danger` #ffb4ad | 10,81:1 | 4,5:1 | OK |
| Anneau de focus sur surface | `--color-focus` #f5f4ef | `--color-surface` #2b2a28 | 13,02:1 | 3:1 | OK |
| Anneau de focus sur fond de page | `--color-focus` #f5f4ef | `--color-canvas` #1f1e1d | 15,11:1 | 3:1 | OK |
| Bordure franche sur surface | `--color-border-strong` #8a877f | `--color-surface` #2b2a28 | 4,00:1 | 3:1 | OK |
| Bordure franche sur fond de page | `--color-border-strong` #8a877f | `--color-canvas` #1f1e1d | 4,64:1 | 3:1 | OK |
| Bordure de ligne sur surface | `--color-border` #6b6962 | `--color-surface` #2b2a28 | 2,61:1 | 2,18:1 | OK |
| Bordure de ligne sur fond de page (informatif) | `--color-border` #6b6962 | `--color-canvas` #1f1e1d | 3,03:1 | 2,18:1 | OK |
| Rail : texte | `--color-sidebar-text` #d6d3ca | `--color-sidebar-bg` #141413 | 12,32:1 | 7:1 | OK |
| Rail : texte au survol | `--color-sidebar-text` #d6d3ca | `--color-sidebar-hover-bg` #2b2a28 | 9,58:1 | 7:1 | OK |
| Rail : élément actif | `--color-sidebar-active-text` #f5f4ef | `--color-sidebar-active-bg` #3a3937 | 10,48:1 | 7:1 | OK |
| Carte : texte | `--map-ui-text` #f5f4ef | `--map-ui-surface` #2b2a28 | 13,02:1 | 7:1 | OK |
| Carte : texte secondaire | `--map-ui-text-muted` #bdbab1 | `--map-ui-surface` #2b2a28 | 7,39:1 | 4,5:1 | OK |
| Carte : icône | `--map-ui-icon` #eceae3 | `--map-ui-surface` #2b2a28 | 11,91:1 | 3:1 | OK |
| Carte : bordure | `--map-ui-border` #6b6962 | `--map-ui-surface` #2b2a28 | 2,61:1 | 2,18:1 | OK |
| Carte : infobulle | `--map-tooltip-text` #f5f4ef | `--map-tooltip-surface` #2b2a28 | 13,02:1 | 7:1 | OK |
| Statut success sur son fond teinté | `--color-success` #9be3b8 | `--color-success-bg` #1e3a2a | 8,31:1 | 7:1 | OK |
| Statut success sur surface | `--color-success` #9be3b8 | `--color-surface` #2b2a28 | 9,61:1 | 7:1 | OK |
| Statut warning sur son fond teinté | `--color-warning` #fad58f | `--color-warning-bg` #3f3118 | 9,00:1 | 7:1 | OK |
| Statut warning sur surface | `--color-warning` #fad58f | `--color-surface` #2b2a28 | 10,23:1 | 7:1 | OK |
| Statut danger sur son fond teinté | `--color-danger` #ffb4ad | `--color-danger-bg` #4a1f1d | 8,23:1 | 7:1 | OK |
| Statut danger sur surface | `--color-danger` #ffb4ad | `--color-surface` #2b2a28 | 8,46:1 | 7:1 | OK |
| Statut info sur son fond teinté | `--color-info` #c7d2fe | `--color-info-bg` #2b3350 | 8,32:1 | 7:1 | OK |
| Statut info sur surface | `--color-info` #c7d2fe | `--color-surface` #2b2a28 | 9,61:1 | 7:1 | OK |
| Graphique : série 1 sur surface (informatif) | `--chart-1` #3987e5 | `--color-surface` #2b2a28 | 3,94:1 | 3:1 | OK |
| Graphique : série 2 sur surface (informatif) | `--chart-2` #d95926 | `--color-surface` #2b2a28 | 3,69:1 | 3:1 | OK |
| Graphique : série 3 sur surface (informatif) | `--chart-3` #199e70 | `--color-surface` #2b2a28 | 4,21:1 | 3:1 | OK |
| Graphique : série 4 sur surface (informatif) | `--chart-4` #c98500 | `--color-surface` #2b2a28 | 4,67:1 | 3:1 | OK |
| Graphique : série 5 sur surface (informatif) | `--chart-5` #d55181 | `--color-surface` #2b2a28 | 3,63:1 | 3:1 | OK |
| Graphique : série 6 sur surface (informatif) | `--chart-6` #008300 | `--color-surface` #2b2a28 | 2,90:1 | 3:1 | sous le seuil, informatif |
| Graphique : série 7 sur surface (informatif) | `--chart-7` #9085e9 | `--color-surface` #2b2a28 | 4,59:1 | 3:1 | OK |
| Graphique : série 8 sur surface (informatif) | `--chart-8` #e66767 | `--color-surface` #2b2a28 | 4,44:1 | 3:1 | OK |

## Bilan

- Couples requis en échec : 0
- Couples informatifs sous le seuil : 5
- Jetons de l'ancienne identité restants dans `frontend/src` : 0
