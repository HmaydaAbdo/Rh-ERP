import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const ligne = {
  id: 1, version: 0, employeeId: 7, nomPrenom: 'Salma Alaoui', cin: 'AB123', fonction: 'Chauffeur', chantierId: 4,
  codeChantier: 'C4', chantier: 'Site', periode: '2026-10', salaireReferenceDh: 4000,
  typeSalaireReference: 'MENSUEL', salaireHoraireDh: 15.38, heuresSupplementaires: 2, montantDh: 30.76,
  stcOuSortie: false, stcDh: 0, forfaitDh: 100, netAPayerDh: 130.76
};

const permissions = ['HEURES_SUP_READ', 'HEURES_SUP_IMPORT', 'HEURES_SUP_DELETE', 'HEURES_SUP_PURGE', 'PAIE_READ', 'EMPLOYEE_READ', 'CHANTIER_READ', 'EQUIPE_READ', 'FUNCTION_READ'];

test('la liste filtrée affiche les champs métier, le total et propose un PDF', async ({ page }) => {
  const api = await mockApi(page, { username: 'rh', permissions }, {
    'POST /heures-supp/search': () => pageDe([ligne]),
    'POST /heures-supp/analytique': () => ({ periode: '2026-10', indicateurs: { employes: 1, lignesHeures: 1, heures: 2, montantDh: 30.76, stcDh: 0, forfaitDh: 100, netAPayerDh: 130.76 }, parChantier: [], parEquipe: [], parFonction: [], definitions: {} }),
    'GET /heures-supp/periodes': () => ['2026-10']
  });

  await page.goto('/heures-supp?periode=2026-10&cin=AB123&nom=Salma');
  await expect(page.getByRole('heading', { name: 'Heures supplémentaires' })).toBeVisible();
  await expect(page.getByText('AB123', { exact: true })).toBeVisible();
  await expect(page.getByText(/15[.,]38 DH\/h/)).toBeVisible();
  await expect(page.getByText(/130[.,]76 DH/).first()).toBeVisible();
  await expect(page.locator('.app-table-bar__summary')).toContainText('Net à payer');
  await expect(page.getByRole('button', { name: 'Exporter les heures supplémentaires filtrées en PDF' })).toBeVisible();
  const presentation = await page.evaluate(() => {
    const filtres = document.querySelector('form.app-toolbar[aria-label="Filtres des heures supplémentaires"]');
    const tops = filtres ? Array.from(filtres.children).filter((element) => getComputedStyle(element).display !== 'none').map((element) => Math.round(element.getBoundingClientRect().top)) : [];
    const actions = document.querySelector<HTMLElement>('.app-vues__actions');
    return { lignesFiltres: new Set(tops).size, espaceActions: actions ? Number.parseFloat(getComputedStyle(actions).columnGap) : 0 };
  });
  expect(presentation.lignesFiltres).toBe(1);
  expect(presentation.espaceActions).toBeGreaterThan(0);
  expect(api.calls).toContain('POST /heures-supp/search');
  expect(api.bodies['POST /heures-supp/search']?.[0]).toMatchObject({ periode: '2026-10', cin: 'AB123', nomPrenom: 'Salma' });

  await page.setViewportSize({ width: 390, height: 844 });
  const diagnostic = await page.evaluate(() => ({
    debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    elements: Array.from(document.querySelectorAll<HTMLElement>('body *')).map((element) => ({
      tag: element.tagName, classe: typeof element.className === 'string' ? element.className : '',
      texte: element.innerText?.slice(0, 40), droite: Math.round(element.getBoundingClientRect().right), largeur: Math.round(element.getBoundingClientRect().width)
    })).filter((element) => element.droite > document.documentElement.clientWidth + 1).slice(0, 12)
  }));
  expect(diagnostic.debordement, JSON.stringify(diagnostic.elements)).toBeLessThanOrEqual(0);
});

test('l’écran de modification présente les données historiques et enregistre sur son parcours dédié', async ({ page }) => {
  const api = await mockApi(page, { username: 'rh', permissions }, {
    'GET /heures-supp/1': () => ligne,
    'PUT /heures-supp/1': () => ({ ...ligne, heuresSupplementaires: 3, montantDh: 46.14, netAPayerDh: 146.14 })
  });

  await page.goto('/heures-supp/1/edit');
  await expect(page.getByRole('heading', { name: 'Modifier la ligne d’heures supplémentaires' })).toBeVisible();
  await expect(page.getByText('AB123', { exact: true })).toBeVisible();
  await expect(page.getByText(/15[.,]38 DH\/h/)).toBeVisible();
  await page.getByLabel('Heures supplémentaires (P/H)').fill('3');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page).toHaveURL(/\/heures-supp\?periode=2026-10/);
  expect(api.bodies['PUT /heures-supp/1']?.[0]).toMatchObject({ version: 0, heuresSupplementaires: 3, forfaitDh: 100 });
});

test('la purge mensuelle utilise le dialogue partagé et confirme le nombre exact', async ({ page }) => {
  const api = await mockApi(page, { username: 'rh', permissions }, {
    'POST /heures-supp/search': () => pageDe([ligne]),
    'POST /heures-supp/analytique': () => ({ periode: '2026-10', indicateurs: { employes: 1, lignesHeures: 1, heures: 2, montantDh: 30.76, stcDh: 0, forfaitDh: 100, netAPayerDh: 130.76 }, parChantier: [], parEquipe: [], parFonction: [], definitions: {} }),
    'GET /heures-supp/periodes': () => ['2026-10'],
    'POST /heures-supp/suppression-mois': () => 1
  });

  await page.goto('/heures-supp?periode=2026-10');
  await page.getByRole('button', { name: 'Supprimer tout le mois 2026-10' }).click();
  await expect(page.getByRole('dialog', { name: 'Supprimer toutes les lignes du mois 2026-10 ?' })).toBeVisible();
  await page.getByLabel('Confirmer le nombre de lignes à supprimer').fill('1');
  await page.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect.poll(() => api.bodies['POST /heures-supp/suppression-mois']?.[0]).toEqual({ periode: '2026-10', nombreAttendu: 1 });
});
