import { expect, Page, test } from '@playwright/test';

const BACKEND_URL = process.env['BACKEND_URL'] ?? 'http://localhost:8080';

async function api<T>(page: Page, token: string, method: string, path: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    data
  });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBeTruthy();
  return response.status() === 204 ? undefined as T : await response.json() as T;
}

test('parcourt les domaines et vérifie les indicateurs Équipe avec et sans accès Paie', async ({ page, browser }) => {
  // Neuf domaines, écritures réelles, historique et second compte : budget d'un parcours intégré complet.
  test.setTimeout(180_000);
  await page.goto('/login');
  await page.getByLabel(/Nom d.utilisateur/).fill(process.env['ADMIN_USERNAME'] ?? 'ci-admin');
  await page.getByLabel('Mot de passe', { exact: true }).fill(process.env['ADMIN_PASSWORD'] ?? 'ci-admin-password');
  const connexionAdmin = page.waitForResponse((response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  const sessionAdmin = await (await connexionAdmin).json() as { accessToken: string };
  const adminToken = sessionAdmin.accessToken;
  await expect(page.locator('a[href="/paie"]').first()).toBeVisible();

  for (const [url, titre] of [
    ['/employees', 'Employés'], ['/chantiers', 'Chantiers'], ['/functions', 'Fonctions'],
    ['/equipes', 'Équipes'], ['/paie', 'Paie'], ['/admin/users', 'Utilisateurs'],
    ['/admin/roles', 'Rôles'], ['/admin/parametres', 'Paramètres'], ['/audit', 'Journal d’audit']
  ] as const) {
    const lien = page.locator(`a[href="${url}"]`).first();
    if (!(await lien.isVisible())) {
      const groupe = url.startsWith('/admin/') || url === '/audit' ? 'Administration système' : 'Référentiel RH';
      await page.getByTitle(groupe, { exact: true }).click();
    }
    await lien.click();
    await expect(page.getByRole('heading', { name: titre })).toBeVisible();
  }

  const suffixe = `${Date.now()}`;
  const equipe = await api<{ id: number }>(page, adminToken, 'POST', '/equipes', {
    code: `T${suffixe}`,
    libelle: `Équipe e2e ${suffixe}`
  });
  const equipeHistorique = await api<{ id: number }>(page, adminToken, 'POST', '/equipes', {
    code: `H${suffixe}`,
    libelle: `Équipe historique e2e ${suffixe}`
  });
  const fonction = await api<{ id: number }>(page, adminToken, 'POST', '/functions', { libelle: `Fonction e2e ${suffixe}` });
  const chantier = await api<{ id: number }>(page, adminToken, 'POST', '/chantiers', {
    code: `T${suffixe}`,
    designation: `Chantier e2e ${suffixe}`,
    nom: `Chantier e2e ${suffixe}`,
    nature: 'AO',
    afficherSurCarte: false
  });
  const employe = await api<{ id: number }>(page, adminToken, 'POST', '/employees', {
    nomPrenom: `Employé e2e ${suffixe}`,
    cin: `E2E${suffixe}`,
    dateNaissance: '1990-01-01',
    dateEmbauche: '2020-01-01',
    fonctionId: fonction.id,
    chantierId: chantier.id,
    equipeId: equipeHistorique.id,
    salaire: null,
    typeSalaire: null
  });

  const maintenant = new Date();
  const moisCourant = `${maintenant.getUTCFullYear()}-${String(maintenant.getUTCMonth() + 1).padStart(2, '0')}`;
  const moisPrecedentDate = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 1, 1));
  const moisPrecedent = `${moisPrecedentDate.getUTCFullYear()}-${String(moisPrecedentDate.getUTCMonth() + 1).padStart(2, '0')}`;
  await api(page, adminToken, 'POST', '/paie', {
    employeeId: employe.id,
    periode: moisPrecedent,
    fonctionId: fonction.id,
    chantierId: chantier.id,
    equipeId: equipeHistorique.id,
    nombreJoursTravailles: 26,
    joursRecuperationOuvrable: null,
    joursRecuperationDimanche: null,
    salaireMensuel: 4000,
    primeRoulageOrdinaire: null,
    primeRoulageDimanche: null,
    salaireTotal: 4000,
    observation: `Historique Équipe e2e ${suffixe}`
  });

  const ficheEmployee = await api<{ version: number; nomPrenom: string; cin: string; dateNaissance: string; dateEmbauche: string; fonction: { id: number }; chantier: { id: number }; statut: string }>(
    page, adminToken, 'GET', `/employees/${employe.id}`
  );
  await api(page, adminToken, 'PUT', `/employees/${employe.id}`, {
    version: ficheEmployee.version,
    nomPrenom: ficheEmployee.nomPrenom,
    cin: ficheEmployee.cin,
    dateNaissance: ficheEmployee.dateNaissance,
    dateEmbauche: ficheEmployee.dateEmbauche,
    fonctionId: ficheEmployee.fonction.id,
    chantierId: ficheEmployee.chantier.id,
    equipeId: equipe.id,
    salaire: null,
    typeSalaire: null,
    statut: ficheEmployee.statut
  });

  for (const [periode, salaire] of [[moisCourant, 4500]] as const) {
    await api(page, adminToken, 'POST', '/paie', {
      employeeId: employe.id,
      periode,
      fonctionId: fonction.id,
      chantierId: chantier.id,
      equipeId: equipe.id,
      nombreJoursTravailles: 26,
      joursRecuperationOuvrable: null,
      joursRecuperationDimanche: null,
      salaireMensuel: salaire,
      primeRoulageOrdinaire: null,
      primeRoulageDimanche: null,
      salaireTotal: salaire,
      observation: `Vérification intégrée Équipe ${suffixe}`
    });
  }

  // Isoler l’équipe créée : le catalogue CI peut dépasser la première page.
  const filtreEquipe = `libelle=${encodeURIComponent(`Équipe e2e ${suffixe}`)}`;
  await page.goto(`/equipes/cartes?${filtreEquipe}`);
  const carteEquipe = page.locator('.perimetre-carte').filter({ hasText: `Équipe e2e ${suffixe}` });
  await expect(carteEquipe).not.toContainText('Employés sur les fiches récentes');
  await expect(carteEquipe).toContainText('Paie ·');
  await expect(carteEquipe.locator('.perimetre-carte__fiches')).toHaveCount(0);
  await expect(carteEquipe.locator('.perimetre-carte__mesures .perimetre-carte__indicateur')).toHaveCount(4);
  await expect(carteEquipe).toContainText('Masse');

  await page.goto(`/equipes/analytique?equipeIds=${equipe.id}&periode=${moisCourant}`);
  await expect(page.locator('.perimetre-analytique__etape')).toContainText(`Équipe e2e ${suffixe}`);
  await expect(page.getByRole('heading', { name: 'Évolution mensuelle par équipe' })).toBeVisible();
  await expect(page.getByText('Aucun bulletin sur ce périmètre')).toHaveCount(0);
  const synthesePaie = await api<{ kpis: { effectif: number; masse: number }; evolution: Array<{ periode: string }> }>(
    page,
    adminToken,
    'POST',
    '/paie/analytique',
    { periode: moisCourant, equipeIds: [equipe.id] }
  );
  expect(synthesePaie.kpis).toMatchObject({ effectif: 1, masse: 4500 });
  expect(synthesePaie.evolution.map((ligne) => ligne.periode)).toEqual([moisCourant]);
  const syntheseHistorique = await api<{ kpis: { effectif: number; masse: number }; evolution: Array<{ periode: string }> }>(
    page,
    adminToken,
    'POST',
    '/paie/analytique',
    { periode: moisCourant, equipeIds: [equipeHistorique.id] }
  );
  expect(syntheseHistorique.kpis).toMatchObject({ effectif: 0, masse: 0 });
  expect(syntheseHistorique.evolution.map((ligne) => ligne.periode)).toEqual([moisPrecedent]);
  await page.goto(`/equipes/analytique?equipeIds=${equipeHistorique.id}&periode=${moisCourant}`);
  await expect(page.locator('.perimetre-analytique__etape')).toContainText(`Équipe historique e2e ${suffixe}`);
  await expect(page.getByRole('heading', { name: /Répartition de la paie par équipe/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Évolution mensuelle par équipe' })).toBeVisible();

  // Fonctions : les deux vues de synthèse lisent la fonction portée par les bulletins du dernier mois.
  const filtreFonction = `libelle=${encodeURIComponent(`Fonction e2e ${suffixe}`)}`;
  await page.goto(`/functions/cartes?${filtreFonction}`);
  const carteFonction = page.locator('.perimetre-carte').filter({ hasText: `Fonction e2e ${suffixe}` });
  await expect(carteFonction).not.toContainText('Employés sur les fiches récentes');
  await expect(carteFonction).toContainText('Paie ·');
  await expect(carteFonction).toContainText('Masse');

  const syntheseFonction = await api<{ kpis: { effectif: number; masse: number }; evolution: Array<{ periode: string }> }>(
    page,
    adminToken,
    'POST',
    '/paie/analytique',
    { periode: moisCourant, fonctionIds: [fonction.id] }
  );
  expect(syntheseFonction.kpis).toMatchObject({ effectif: 1, masse: 4500 });
  expect(syntheseFonction.evolution.map((ligne) => ligne.periode)).toEqual([moisPrecedent, moisCourant]);
  await page.goto(`/functions/analytique?fonctionIds=${fonction.id}&periode=${moisCourant}`);
  await expect(page.locator('.perimetre-analytique__etape')).toContainText(`Fonction e2e ${suffixe}`);
  await expect(page.getByRole('heading', { name: /Répartition de la paie par fonction/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Évolution mensuelle par fonction' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Situation des fiches Employé' })).toHaveCount(0);

  // Chantiers : les synthèses utilisent exclusivement les bulletins de la paie récente.
  const filtreChantier = `code=${encodeURIComponent(`T${suffixe}`)}`;
  await page.goto(`/chantiers/cartes?${filtreChantier}`);
  const carteChantier = page.locator('.perimetre-carte').filter({ hasText: `T${suffixe}` });
  await expect(carteChantier).toContainText('En cours');
  await expect(carteChantier).not.toContainText('Employés sur les fiches récentes');
  await expect(carteChantier.locator('.perimetre-carte__mesures .perimetre-carte__indicateur')).toHaveCount(4);
  await expect(carteChantier).toContainText('Paie ·');
  await expect(carteChantier).toContainText('Masse');

  const syntheseChantier = await api<{ kpis: { effectif: number; masse: number }; evolution: Array<{ periode: string }>; parChantier: Array<{ id: number; stc: number }> }>(
    page,
    adminToken,
    'POST',
    '/paie/analytique',
    { periode: moisCourant, chantierIds: [chantier.id] }
  );
  expect(syntheseChantier.kpis).toMatchObject({ effectif: 1, masse: 4500 });
  expect(syntheseChantier.parChantier).toEqual([expect.objectContaining({ id: chantier.id, stc: 0 })]);
  expect(syntheseChantier.evolution.map((ligne) => ligne.periode)).toEqual([moisPrecedent, moisCourant]);
  await page.goto(`/chantiers/analytique?chantierIds=${chantier.id}&periode=${moisCourant}`);
  await expect(page.locator('.perimetre-analytique__etape')).toContainText(`T${suffixe}`);
  await expect(page.getByRole('heading', { name: 'Évolution mensuelle par chantier' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Situation des fiches Employé' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Fonctions de la répartition' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Équipes de la répartition' })).toBeVisible();

  const roles = await api<{ content: Array<{ id: number; nom: string }> }>(page, adminToken, 'POST', '/roles/search', {});
  const roleMetier = roles.content.find((role) => role.nom === 'PAIE_MANAGER');
  expect(roleMetier, 'Le rôle métier PAIE_MANAGER doit exister après les migrations').toBeTruthy();
  const permissions = await api<Array<{ id: number; code: string }>>(page, adminToken, 'GET', '/permissions');
  const permissionPaie = permissions.find((permission) => permission.code === 'PAIE_READ');
  expect(permissionPaie, 'La permission PAIE_READ doit exister après les migrations').toBeTruthy();
  const permissionEmployee = permissions.find((permission) => permission.code === 'EMPLOYEE_READ');
  expect(permissionEmployee, 'La permission EMPLOYEE_READ doit exister après les migrations').toBeTruthy();
  const suffixeCompte = `${suffixe}`;
  const compteLimite = await api<{ id: number; version: number }>(page, adminToken, 'POST', '/users', {
    username: `e2e-${suffixeCompte}`,
    email: `e2e-${suffixeCompte}@example.invalid`,
    motDePasse: 'MotDePasse2026!',
    employeeId: null,
    roleIds: [roleMetier!.id]
  });
  await api(page, adminToken, 'PUT', `/users/${compteLimite.id}/permissions-refusees`, {
    version: compteLimite.version,
    permissionIds: [permissionPaie!.id, permissionEmployee!.id]
  });

  const contexteLimite = await browser.newContext({ baseURL: new URL(page.url()).origin, locale: 'fr-FR', timezoneId: 'Africa/Casablanca' });
  try {
    const pageLimitee = await contexteLimite.newPage();
    await pageLimitee.goto('/login');
    await pageLimitee.getByLabel(/Nom d.utilisateur/).fill(`e2e-${suffixeCompte}`);
    await pageLimitee.getByLabel('Mot de passe', { exact: true }).fill('MotDePasse2026!');
    const connexionLimitee = pageLimitee.waitForResponse((response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST');
    await pageLimitee.getByRole('button', { name: 'Se connecter' }).click();
    const sessionLimitee = await (await connexionLimitee).json() as { accessToken: string; utilisateur: { permissionsEffectives: string[] } };
    expect(sessionLimitee.utilisateur.permissionsEffectives).not.toContain('PAIE_READ');
    expect(sessionLimitee.utilisateur.permissionsEffectives).not.toContain('EMPLOYEE_READ');

    await pageLimitee.goto(`/equipes/cartes?${filtreEquipe}`);
    const carteLimitee = pageLimitee.locator('.perimetre-carte').filter({ hasText: `Équipe e2e ${suffixe}` });
    await expect(carteLimitee).not.toContainText('Employés sur les fiches récentes');
    await expect(carteLimitee).not.toContainText('Payés');
    await expect(carteLimitee).not.toContainText('Masse');

    await pageLimitee.goto(`/equipes/analytique?equipeIds=${equipe.id}&periode=${moisCourant}`);
    await expect(pageLimitee.getByText('L’effectif mensuel par équipe n’est pas disponible pour votre compte.')).toBeVisible();
    await expect(pageLimitee.getByRole('heading', { name: /Paie ·/ })).toHaveCount(0);
    await pageLimitee.goto(`/chantiers/cartes?${filtreChantier}`);
    const carteChantierLimitee = pageLimitee.locator('.perimetre-carte').filter({ hasText: `T${suffixe}` });
    await expect(carteChantierLimitee).toBeVisible();
    await expect(carteChantierLimitee).not.toContainText('Employés sur les fiches récentes');
    await expect(carteChantierLimitee).not.toContainText('Payés');
    await expect(carteChantierLimitee).not.toContainText('Masse');
    await pageLimitee.goto(`/chantiers/analytique?chantierIds=${chantier.id}&periode=${moisCourant}`);
    await expect(pageLimitee.getByText('L’effectif mensuel par chantier n’est pas disponible pour votre compte.')).toBeVisible();
    await expect(pageLimitee.getByRole('heading', { name: /Paie ·/ })).toHaveCount(0);
    await pageLimitee.goto(`/functions/cartes?${filtreFonction}`);
    const carteFonctionLimitee = pageLimitee.locator('.perimetre-carte').filter({ hasText: `Fonction e2e ${suffixe}` });
    await expect(carteFonctionLimitee).toBeVisible();
    await expect(carteFonctionLimitee).not.toContainText('Employés sur les fiches récentes');
    await expect(carteFonctionLimitee).not.toContainText('Payés');
    await expect(carteFonctionLimitee).not.toContainText('Masse');
    await pageLimitee.goto(`/functions/analytique?fonctionIds=${fonction.id}&periode=${moisCourant}`);
    await expect(pageLimitee.getByText('L’effectif mensuel par fonction n’est pas disponible pour votre compte.')).toBeVisible();
    await expect(pageLimitee.getByRole('heading', { name: /Paie ·/ })).toHaveCount(0);
    const reponseInterdite = await pageLimitee.request.get(`${BACKEND_URL}/paie/periodes`, {
      headers: { Authorization: `Bearer ${sessionLimitee.accessToken}` }
    });
    expect(reponseInterdite.status()).toBe(403);
  } finally {
    await contexteLimite.close();
  }
});
