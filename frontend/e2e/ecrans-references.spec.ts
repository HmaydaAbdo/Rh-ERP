import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

import { mockApi, page as pageDe } from './support/api-mock';

/**
 * Captures des écrans de référence de E0.5 (à faire valider par le propriétaire) : la paie sur ordinateur et un écran de chantier
 * sur téléphone, en clair et en sombre, avec des données réalistes simulées. Régénération : `npm run e2e:references` (écrit dans
 * `site/docs/frontend/references/`). Elles servent de repère de revue, pas de comparaison pixel à pixel.
 */
test.skip(!process.env['E2E_REFERENCES'], 'Captures de référence : lancer `npm run e2e:references`.');

const DOSSIER = resolve(process.cwd(), '..', 'site', 'docs', 'frontend', 'references');

const PERSONNES: [string, string, string, string, number, number, number][] = [
  ['ALAMI Karim', 'AB1234', 'CH. CAMION', 'Chauffeurs', 26, 4500, 300],
  ['BENNANI Salma', 'CD5678', 'CONDUCTEUR DE TRAVAUX', 'Encadrement', 26, 9800, 0],
  ['IDRISSI Youssef', 'EF9012', 'MACON', 'Maçons', 24, 3900, 0],
  ['TAZI Hamid', 'GH3456', 'GRUTIER', 'Grutiers', 26, 5200, 450],
  ['FASSI Nadia', 'IJ7890', 'MAGASINIER', 'Logistique', 22, 3600, 0],
  ['OUAZZANI Rachid', 'KL1234', 'CH. CAMION', 'Chauffeurs', 26, 4500, 300],
  ['CHRAIBI Amine', 'MN5678', 'FERRAILLEUR', 'Ferrailleurs', 25, 3800, 0],
  ['BERRADA Leila', 'OP9012', 'TOPOGRAPHE', 'Encadrement', 26, 7200, 0]
];

const BULLETINS = PERSONNES.map(([nom, cin, fonction, equipe, jours, salaire, prime], i) => ({
  id: 10 + i,
  employee: { id: 100 + i, nomPrenom: nom, cin },
  fonction: { id: 2 + (i % 4), libelle: fonction },
  chantier: { id: 3 + (i % 2), code: i % 2 ? 'C196' : 'C168', designation: i % 2 ? 'Autoroute Rabat–Fès' : 'Route de Nador' },
  equipe: { id: 5 + (i % 5), code: equipe.slice(0, 2).toUpperCase(), libelle: equipe },
  periode: '2026-08',
  nombreJoursTravailles: jours,
  joursRecuperationOuvrable: 0,
  joursRecuperationDimanche: 0,
  salaireMensuel: salaire,
  primeRoulageOrdinaire: prime,
  primeRoulageDimanche: 0,
  salaireTotal: salaire + prime,
  observation: i === 4 ? 'Congé du 18 au 20' : null
}));

const MASSE = BULLETINS.reduce((somme, b) => somme + b.salaireTotal, 0);
const PERIODES = [
  { periode: '2026-08', nombreBulletins: 8, nombreChantiers: 2, masse: MASSE, stc: 0, stcMontant: 0 },
  { periode: '2026-07', nombreBulletins: 8, nombreChantiers: 2, masse: MASSE - 1800, stc: 1, stcMontant: 5200 }
];

const CHANTIERS = [
  { id: 3, version: 0, code: 'C168', designation: 'Route de Nador', nom: null, sourceErp: true, actif: true },
  { id: 4, version: 0, code: 'C196', designation: 'Autoroute Rabat–Fès', nom: 'Lot 2', sourceErp: true, actif: true },
  { id: 5, version: 0, code: 'C204', designation: 'Barrage Tamri', nom: null, sourceErp: false, actif: false }
];

const ANALYSE = {
  periode: '2026-08',
  kpis: { masse: MASSE, effectif: 8, coutMoyen: Math.round(MASSE / 8), nombreChantiers: 2, stc: 0, stcMontant: 0 },
  moisPrecedent: { masse: MASSE - 1800, effectif: 8, coutMoyen: Math.round((MASSE - 1800) / 8), nombreChantiers: 2, stc: 1, stcMontant: 5200 },
  parEquipe: [], parFonction: [], tranches: [], qualite: { sansEquipe: 0, sansObservation: 0 },
  parChantier: [
    { id: 3, code: 'C168', libelle: 'Route de Nador', masse: 19400, effectif: 4, stc: 0, stcMontant: 0 },
    { id: 4, code: 'C196', libelle: 'Autoroute Rabat–Fès', masse: 25200, effectif: 4, stc: 0, stcMontant: 0 }
  ],
  evolution: [{ periode: '2026-07', masse: MASSE - 1800, effectif: 8, stc: 1, stcMontant: 5200 }, { periode: '2026-08', masse: MASSE, effectif: 8, stc: 0, stcMontant: 0 }]
};

const ROUTES = {
  'POST /paie/search': () => pageDe(BULLETINS),
  'GET /paie/periodes': () => PERIODES,
  'POST /paie/periodes/search': () => PERIODES,
  'POST /paie/analytique': () => ANALYSE,
  'POST /paie/options/chantiers': () => pageDe(CHANTIERS),
  'POST /paie/options/equipes': () => pageDe([{ id: 5, code: 'CH', libelle: 'Chauffeurs' }]),
  'GET /paie/materiel': () => [],
  'GET /paie/materiel/valeurs': () => [],
  'POST /chantiers/search': () => pageDe(CHANTIERS),
  'POST /equipes/search': () => pageDe([]),
  'POST /functions/search': () => pageDe([]),
  'POST /employees/regroupements': () => [{ id: 3, code: 'C168', libelle: 'Route de Nador', effectif: 4, actifs: 4 }],
  'POST /employees/analytique': () => ({ effectif: 8, actifs: 8, inactifs: 0, ageMoyen: 36, ancienneteMoyenne: 4.5, embauchesDouzeMois: 1, parAge: [], parAnciennete: [] }),
  'POST /paie/effectifs': () => []
};

const DROITS = ['PAIE_READ', 'PAIE_WRITE', 'PAIE_EXPORT', 'PAIE_IMPORT', 'CHANTIER_READ', 'CHANTIER_WRITE', 'EMPLOYEE_READ', 'EQUIPE_READ', 'FUNCTION_READ'];

for (const theme of ['light', 'dark'] as const) {
  test(`paie sur ordinateur — ${theme}`, async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: DROITS }, ROUTES);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((valeur) => localStorage.setItem('staport-theme', valeur), theme);
    await page.goto('/paie');
    await expect(page.getByRole('gridcell', { name: 'ALAMI Karim', exact: true })).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(DOSSIER, `paie-${theme}-ordinateur.png`), animations: 'disabled' });
  });

  test(`chantiers sur téléphone — ${theme}`, async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: DROITS }, ROUTES);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((valeur) => localStorage.setItem('staport-theme', valeur), theme);
    await page.goto('/chantiers/cartes');
    await expect(page.locator('.app-entity').first()).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(DOSSIER, `chantiers-${theme}-telephone.png`), animations: 'disabled' });
  });
}
