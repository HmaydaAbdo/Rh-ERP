import { createAngularCatalog } from '@copilotkit/angular/a2ui';
import { z } from 'zod';

import { CHAMP_CATALOGUE_ERP } from './identifiant-catalogue';
import { A2uiChartComponent } from './a2ui-chart.component';
import { A2uiDataTableComponent } from './a2ui-data-table.component';
import { A2uiKpiGridComponent } from './a2ui-kpi-grid.component';

const FORMAT = z.enum(['texte', 'nombre', 'montant', 'periode']);

/**
 * Composants de l'ERP ajoutés au catalogue de base A2UI : mêmes noms et mêmes propriétés que
 * `ia/src/erp_rh_ia/catalogue_a2ui_erp.json`, que le service IA utilise pour valider les surfaces.
 */
export const catalogueErp = createAngularCatalog(
  {
    DataTable: {
      description: 'Tableau de données : tri, recherche, export CSV et plein écran.',
      props: z.object({
        title: z.string().optional(),
        caption: z.string().optional(),
        columns: z.array(
          z.object({ key: z.string(), label: z.string(), format: FORMAT.optional(), bar: z.boolean().optional() })
        ),
        rows: z.any()
      })
    },
    KpiGrid: {
      description: "Grille d'indicateurs clés.",
      props: z.object({
        items: z.array(
          z.object({
            label: z.string(),
            value: z.string(),
            detail: z.string().optional(),
            tone: z.enum(['neutre', 'positif', 'negatif']).optional()
          })
        )
      })
    },
    Chart: {
      description: 'Graphique en barres, courbe ou anneau.',
      props: z.object({
        title: z.string().optional(),
        type: z.enum(['bar', 'line', 'doughnut']),
        labels: z.array(z.string()),
        series: z.array(
          z.object({ name: z.string(), values: z.array(z.number()), format: z.enum(['nombre', 'montant']).optional() })
        )
      })
    }
  },
  { DataTable: A2uiDataTableComponent, KpiGrid: A2uiKpiGridComponent, Chart: A2uiChartComponent },
  { catalogId: CHAMP_CATALOGUE_ERP, includeBasicCatalog: true }
);
