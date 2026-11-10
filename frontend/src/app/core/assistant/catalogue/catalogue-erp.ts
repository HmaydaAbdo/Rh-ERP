import { createAngularCatalog } from '@copilotkit/angular/a2ui';

import { A2uiChartComponent } from './a2ui-chart.component';
import { A2uiDataTableComponent } from './a2ui-data-table.component';
import { A2uiKpiGridComponent } from './a2ui-kpi-grid.component';
import { A2uiTimelineComponent } from './a2ui-timeline.component';
import { DESCRIPTIONS, PROPRIETES_CHART, PROPRIETES_DATA_TABLE, PROPRIETES_KPI_GRID, PROPRIETES_TIMELINE } from './definitions-catalogue';
import { CHAMP_CATALOGUE_ERP } from './identifiant-catalogue';
import { SurfaceA2uiErpComponent } from './surface-a2ui-erp.component';

/**
 * Catalogue que l'application déclare à CopilotKit (`a2ui.catalog`) : il annonce à l'agent les composants de l'ERP (mêmes noms
 * et mêmes propriétés que `ia/src/staport_ia/catalogue_a2ui_erp.json`) et fait monter `SurfaceA2uiErpComponent`, qui rend les
 * surfaces avec `@a2ui/angular`. Les classes passées à `createAngularCatalog` ne servent qu'à la déclaration : le rendu des
 * composants appartient à `creerCatalogueRendu`.
 */
export const catalogueErp = Object.assign(
  createAngularCatalog(
    {
      DataTable: { description: DESCRIPTIONS.DataTable, props: PROPRIETES_DATA_TABLE },
      KpiGrid: { description: DESCRIPTIONS.KpiGrid, props: PROPRIETES_KPI_GRID },
      Chart: { description: DESCRIPTIONS.Chart, props: PROPRIETES_CHART },
      Timeline: { description: DESCRIPTIONS.Timeline, props: PROPRIETES_TIMELINE }
    },
    { DataTable: A2uiDataTableComponent, KpiGrid: A2uiKpiGridComponent, Chart: A2uiChartComponent, Timeline: A2uiTimelineComponent },
    { catalogId: CHAMP_CATALOGUE_ERP, includeBasicCatalog: true }
  ),
  { surfaceComponent: SurfaceA2uiErpComponent }
);
