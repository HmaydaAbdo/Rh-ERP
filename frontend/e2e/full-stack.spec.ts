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
    await page.locator(`a[href="${url}"]`).first().click();
    await expect(page.getByRole('heading', { name: titre })).toBeVisible();
  }

  const suffixe = `${Date.now()}`;
  const equipe = await api<{ id: number }>(page, adminToken, 'POST', '/equipes', {
    code: `T${suffixe}`,
    libelle: `Équipe e2e ${suffixe}`
  });
  const fonction = await api<{ id: number }>(page, adminToken, 'POST', '/functions', { libelle: `Fonction e2e ${suffixe}` });
  const chantier = await api<{ id: number }>(page, adminToken, 'POST', '/chantiers', {
    code: `T${suffixe}`,
    designation: `Chantier e2e ${suffixe}`,
    nom: `Chantier e2e ${suffixe}`
  });
  const employe = await api<{ id: number }>(page, adminToken, 'POST', '/employees', {
    nomPrenom: `Employé e2e ${suffixe}`,
    cin: `E2E${suffixe}`,
    dateNaissance: '1990-01-01',
    dateEmbauche: '2020-01-01',
    fonctionId: fonction.id,
    chantierId: chantier.id,
    equipeId: equipe.id,
    salaire: null,
    typeSalaire: null
  });

  const maintenant = new Date();
  const moisCourant = `${maintenant.getUTCFullYear()}-${String(maintenant.getUTCMonth() + 1).padStart(2, '0')}`;
  const moisPrecedentDate = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 1, 1));
  const moisPrecedent = `${moisPrecedentDate.getUTCFullYear()}-${String(moisPrecedentDate.getUTCMonth() + 1).padStart(2, '0')}`;
  for (const [periode, salaire] of [[moisPrecedent, 4000], [moisCourant, 4500]] as const) {
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
  const carteEquipe = page.locator('.equipe-carte').filter({ hasText: `Équipe e2e ${suffixe}` });
  await expect(carteEquipe).toContainText('Employés sur les fiches récentes');
  await expect(carteEquipe).toContainText('Payés');
  await expect(carteEquipe).toContainText('Masse');

  await page.goto(`/equipes/analytique?equipeId=${equipe.id}&periode=${moisCourant}`);
  await expect(page.getByRole('heading', { name: /Paie · Équipe e2e/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Évolution mensuelle de la masse' })).toBeVisible();
  await expect(page.locator('table tbody tr')).toHaveCount(2);
  const synthesePaie = await api<{ kpis: { effectif: number; masse: number }; evolution: Array<{ periode: string }> }>(
    page,
    adminToken,
    'POST',
    '/paie/analytique',
    { periode: moisCourant, equipeIds: [equipe.id] }
  );
  expect(synthesePaie.kpis).toMatchObject({ effectif: 1, masse: 4500 });
  expect(synthesePaie.evolution.map((ligne) => ligne.periode)).toEqual([moisPrecedent, moisCourant]);

  const roles = await api<{ content: Array<{ id: number; nom: string }> }>(page, adminToken, 'POST', '/roles/search', {});
  const roleMetier = roles.content.find((role) => role.nom === 'PAIE_MANAGER');
  expect(roleMetier, 'Le rôle métier PAIE_MANAGER doit exister après les migrations').toBeTruthy();
  const permissions = await api<Array<{ id: number; code: string }>>(page, adminToken, 'GET', '/permissions');
  const permissionPaie = permissions.find((permission) => permission.code === 'PAIE_READ');
  expect(permissionPaie, 'La permission PAIE_READ doit exister après les migrations').toBeTruthy();
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
    permissionIds: [permissionPaie!.id]
  });

  const contexteLimite = await browser.newContext({ baseURL: 'http://localhost:4300', locale: 'fr-FR', timezoneId: 'Africa/Casablanca' });
  try {
    const pageLimitee = await contexteLimite.newPage();
    await pageLimitee.goto('/login');
    await pageLimitee.getByLabel(/Nom d.utilisateur/).fill(`e2e-${suffixeCompte}`);
    await pageLimitee.getByLabel('Mot de passe', { exact: true }).fill('MotDePasse2026!');
    const connexionLimitee = pageLimitee.waitForResponse((response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST');
    await pageLimitee.getByRole('button', { name: 'Se connecter' }).click();
    const sessionLimitee = await (await connexionLimitee).json() as { accessToken: string; utilisateur: { permissionsEffectives: string[] } };
    expect(sessionLimitee.utilisateur.permissionsEffectives).not.toContain('PAIE_READ');

    await pageLimitee.goto(`/equipes/cartes?${filtreEquipe}`);
    const carteLimitee = pageLimitee.locator('.equipe-carte').filter({ hasText: `Équipe e2e ${suffixe}` });
    await expect(carteLimitee).toContainText('Employés sur les fiches récentes');
    await expect(carteLimitee).not.toContainText('Payés');
    await expect(carteLimitee).not.toContainText('Masse');

    await pageLimitee.goto(`/equipes/analytique?equipeId=${equipe.id}&periode=${moisCourant}`);
    await expect(pageLimitee.getByText('Les indicateurs de paie ne sont pas disponibles pour votre compte.')).toBeVisible();
    await expect(pageLimitee.getByRole('heading', { name: /Paie ·/ })).toHaveCount(0);
    const reponseInterdite = await pageLimitee.request.get(`${BACKEND_URL}/paie/periodes`, {
      headers: { Authorization: `Bearer ${sessionLimitee.accessToken}` }
    });
    expect(reponseInterdite.status()).toBe(403);
  } finally {
    await contexteLimite.close();
  }
});
