import { DynamicValueSchema } from '@a2ui/web_core/v0_9';
import { z } from 'zod';

const FORMAT = z.enum(['texte', 'nombre', 'montant', 'periode']);

/**
 * Propriétés des composants du catalogue de l'ERP : mêmes noms et mêmes propriétés que
 * `ia/src/staport_ia/catalogue_a2ui_erp.json`, que le service IA utilise pour valider les surfaces.
 * Une seule source pour l'annonce faite à l'agent (`createAngularCatalog`) et pour le rendu (`@a2ui/angular`).
 */
export const PROPRIETES_DATA_TABLE = z.object({
  weight: z.number().optional(),
  title: z.string().optional(),
  caption: z.string().optional(),
  columns: z.array(z.object({ key: z.string(), label: z.string(), format: FORMAT.optional(), bar: z.boolean().optional() })),
  // Lignes littérales ou liées au modèle de données de la surface (`{ path }`) : seul un type dynamique est résolu par le rendu.
  rows: DynamicValueSchema
});

export const PROPRIETES_KPI_GRID = z.object({
  weight: z.number().optional(),
  items: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      detail: z.string().optional(),
      tone: z.enum(['neutre', 'positif', 'negatif']).optional()
    })
  )
});

export const PROPRIETES_CHART = z.object({
  weight: z.number().optional(),
  title: z.string().optional(),
  type: z.enum(['bar', 'line', 'doughnut']),
  labels: z.array(z.string()),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()), format: z.enum(['nombre', 'montant']).optional() }))
});

export const DESCRIPTIONS = {
  DataTable: 'Tableau de données : tri, recherche, export CSV et plein écran.',
  KpiGrid: "Grille d'indicateurs clés.",
  Chart: 'Graphique en barres, courbe ou anneau.'
} as const;
