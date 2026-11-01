import type { ComponentApi } from '@a2ui/web_core/v0_9';

import { PROPRIETES_CHART, PROPRIETES_DATA_TABLE, PROPRIETES_KPI_GRID } from './definitions-catalogue';

/** Les composants de l'ERP au format `ComponentApi` d'A2UI (nom et schéma), pour le rendu `@a2ui/angular`. */
export const DataTableApi = { name: 'DataTable', schema: PROPRIETES_DATA_TABLE.strict() } satisfies ComponentApi;
export const KpiGridApi = { name: 'KpiGrid', schema: PROPRIETES_KPI_GRID.strict() } satisfies ComponentApi;
export const ChartApi = { name: 'Chart', schema: PROPRIETES_CHART.strict() } satisfies ComponentApi;
