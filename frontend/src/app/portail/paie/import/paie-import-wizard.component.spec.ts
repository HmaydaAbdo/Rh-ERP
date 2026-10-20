import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { PaieImportAnalyse } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieImportWizardComponent } from './paie-import-wizard.component';
import { PaieImportStore } from './paie-import.store';

const ANALYSE: PaieImportAnalyse = {
  periode: '2026-10',
  totalLignes: 3,
  erreurs: [{ numeroLigne: 4, cin: 'XX1', nomPrenom: 'INCONNU', raison: 'Chantier introuvable : C999' }],
  chantiersClotures: [{ chantierId: 8, code: 'C059', designation: 'Voirie', lignes: [6] }],
  cinInconnus: [{ numeroLigne: 5, cin: 'NV2', nomPrenom: 'NOUVEAU', fonction: 'MACON', chantier: 'C059', equipe: null, salaire: 4000 }],
  ecarts: [
    {
      employeId: 9,
      numeroLigne: 6,
      cin: 'AB9',
      nomPrenom: 'ALI ALAOUI',
      typeSalaire: 'MENSUEL',
      champs: [
        { champ: 'chantier', base: 'C059', fichier: 'C168' },
        { champ: 'salaire', base: '4000.00', fichier: '4500' }
      ]
    }
  ],
  departs: [{ employeId: 2, cin: 'CD2', nomPrenom: 'OMAR', motif: null }],
  retours: [],
  pret: false
};

describe('PaieImportWizardComponent', () => {
  let fixture: ComponentFixture<PaieImportWizardComponent>;
  let service: { analyserImport: ReturnType<typeof vi.fn>; corrigerImport: ReturnType<typeof vi.fn>; importer: ReturnType<typeof vi.fn> };
  const dialogue = () => document.querySelector('.import-wizard') as HTMLElement;
  const store = () => fixture.debugElement.injector.get(PaieImportStore);

  async function ouvrir(permissions: string[]): Promise<void> {
    service = { analyserImport: vi.fn().mockReturnValue(of(ANALYSE)), corrigerImport: vi.fn().mockReturnValue(of(ANALYSE)), importer: vi.fn() };
    TestBed.configureTestingModule({ providers: [fournirPermissions(permissions).providers, { provide: PaieService, useValue: service }] });
    fixture = TestBed.createComponent(PaieImportWizardComponent);
    fixture.componentRef.setInput('periodes', ['2026-09']);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function analyser(): Promise<void> {
    store().analyser(new File(['x'], 'paie.xlsx'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove()));

  it('annonce le mois imposé avant le choix du fichier', async () => {
    await ouvrir(['PAIE_IMPORT', 'PAIE_READ', 'EMPLOYEE_WRITE']);

    expect(dialogue().querySelector('.import-wizard__mois strong')?.textContent).toBe('octobre 2026');
    expect(dialogue().querySelector('.import-wizard__depot input[type="file"]')).not.toBeNull();
  });

  it('range chaque problème avec sa solution : fichier, chantier à rouvrir, fiche à créer, fiche à mettre à jour', async () => {
    await ouvrir(['PAIE_IMPORT', 'PAIE_READ', 'EMPLOYEE_WRITE', 'CHANTIER_READ', 'CHANTIER_WRITE']);
    await analyser();

    const texte = dialogue().textContent ?? '';
    expect(texte).toContain('4 problème(s) à régler');
    expect(texte).toContain('Chantier introuvable : C999');
    expect(texte).toContain('Chantiers clôturés');
    expect(dialogue().querySelector('button[aria-label="Rouvrir le chantier C059"]')).not.toBeNull();
    expect(texte).toContain('NOUVEAU');
    expect(Array.from(dialogue().querySelectorAll('.controle__ecarts dd')).map((dd) => dd.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['C059 devient C168', '4 000,00 devient 4 500,00']);
    const continuer = Array.from(dialogue().querySelectorAll('button')).find((b) => b.textContent?.includes('Continuer')) as HTMLButtonElement;
    expect(continuer.disabled).toBe(true);

    (dialogue().querySelector('button[aria-label="Mettre à jour la fiche de ALI ALAOUI"]') as HTMLButtonElement).click();
    expect(service.corrigerImport).toHaveBeenCalledWith(expect.any(File), '2026-10', { aligner: [{ employeId: 9, typeSalaire: null }], creer: [] });
  });

  it('sans le droit d’écrire les employés, ne propose que de corriger le fichier', async () => {
    await ouvrir(['PAIE_IMPORT', 'PAIE_READ']);
    await analyser();

    expect(dialogue().textContent).toContain('Vous ne pouvez pas modifier les fiches des employés');
    expect(dialogue().querySelector('button[aria-label^="Mettre à jour la fiche"]')).toBeNull();
    expect(dialogue().querySelector('button[aria-label^="Rouvrir le chantier"]')).toBeNull();
    expect(dialogue().textContent).toContain('Vous ne pouvez pas modifier les chantiers');
    expect(Array.from(dialogue().querySelectorAll('button')).some((b) => b.textContent?.includes('Créer l’employé') || b.textContent?.includes("Créer l'employé"))).toBe(false);
  });
});
