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
  avertissements: [],
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
  controlesPeriode: [],
  blocagesPeriode: [],
  pret: false
};

describe('PaieImportWizardComponent', () => {
  let fixture: ComponentFixture<PaieImportWizardComponent>;
  let service: { analyserImport: ReturnType<typeof vi.fn>; corrigerImport: ReturnType<typeof vi.fn>; importer: ReturnType<typeof vi.fn> };
  const dialogue = () => document.querySelector('.app-wizard') as HTMLElement;
  const store = () => fixture.debugElement.injector.get(PaieImportStore);

  async function ouvrir(permissions: string[]): Promise<void> {
    service = { analyserImport: vi.fn().mockReturnValue(of(ANALYSE)), corrigerImport: vi.fn().mockReturnValue(of(ANALYSE)), importer: vi.fn() };
    TestBed.configureTestingModule({ providers: [fournirPermissions(permissions).providers, { provide: PaieService, useValue: service }] });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 8)); // 8 novembre 2026 : le mois proposé est octobre
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

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove());
  });

  it('propose le mois écoulé, au choix de l’utilisateur, avant le choix du fichier', async () => {
    await ouvrir(['PAIE_IMPORT', 'PAIE_READ', 'EMPLOYEE_WRITE']);

    expect(dialogue().querySelector('.app-wizard__mois stp-month-input')?.textContent).toContain('10/2026');
    expect(dialogue().querySelector('.app-wizard__depot input[type="file"]')).not.toBeNull();
  });

  /** Règle la catégorie en cours comme le ferait l'utilisateur (corrections ou fichier corrigé) : la suivante s'ouvre. */
  function regler(modification: Partial<PaieImportAnalyse>): void {
    store().analyse.set({ ...store().analyse()!, ...modification });
    fixture.detectChanges();
  }

  it('range les problèmes par catégorie, dans l’ordre : une seule catégorie ouverte à la fois', async () => {
    await ouvrir(['PAIE_IMPORT', 'PAIE_READ', 'EMPLOYEE_WRITE', 'CHANTIER_READ', 'CHANTIER_WRITE']);
    await analyser();

    let texte = dialogue().textContent ?? '';
    expect(texte).toContain('4 problème(s) à régler');
    expect(texte).toContain('Catégorie 1 sur 4');
    expect(Array.from(dialogue().querySelectorAll('.app-controle__fil-etape')).map((e) => e.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['Fichier 1', 'Chantiers 1', 'CIN sans fiche 1', 'Fiches 1']);
    expect(texte).toContain('Chantier introuvable : C999');
    expect(texte).not.toContain('Voirie');
    const continuer = () => Array.from(dialogue().querySelectorAll('button')).find((x) => x.textContent?.trim() === 'Continuer') as HTMLButtonElement;
    expect(continuer().disabled).toBe(true);

    regler({ erreurs: [] });
    texte = dialogue().textContent ?? '';
    expect(texte).toContain('Catégorie 2 sur 4');
    expect(texte).toContain('Chantiers clôturés');
    expect(texte).not.toContain('Chantier introuvable');
    expect(dialogue().querySelector('button[aria-label="Rouvrir le chantier C059"]')).not.toBeNull();

    regler({ chantiersClotures: [] });
    expect(dialogue().textContent).toContain('NOUVEAU');

    regler({ cinInconnus: [] });
    expect(Array.from(dialogue().querySelectorAll('.app-controle__ecarts dd')).map((dd) => dd.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['C059 devient C168', '4 000 devient 4 500']);

    (dialogue().querySelector('button[aria-label="Mettre à jour la fiche de ALI ALAOUI"]') as HTMLButtonElement).click();
    expect(service.corrigerImport).toHaveBeenCalledWith(expect.any(File), '2026-10', { aligner: [{ employeId: 9, typeSalaire: 'MENSUEL' }], creer: [] });
  });

  it('un mois bloqué n’affiche qu’un message et ne laisse rien avancer', async () => {
    await ouvrir(['PAIE_IMPORT', 'PAIE_READ']);
    service.analyserImport.mockReturnValue(
      of({ ...ANALYSE, erreurs: [], chantiersClotures: [], cinInconnus: [], ecarts: [], blocagesPeriode: [{ code: 'MOIS_DEJA_IMPORTE', message: 'La paie de 2026-10 existe déjà.', periodeReference: null }] })
    );
    await analyser();

    expect(dialogue().textContent).toContain('Ce mois ne peut pas être importé');
    expect(dialogue().querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(store().controleTermine()).toBe(false);
    const continuer = Array.from(dialogue().querySelectorAll('button')).find((x) => x.textContent?.trim() === 'Continuer') as HTMLButtonElement;
    expect(continuer.disabled).toBe(true);
  });

  it('groupe les erreurs du fichier par type quand elles sont nombreuses, détail à la demande', async () => {
    await ouvrir(['PAIE_IMPORT', 'PAIE_READ']);
    const erreurs = Array.from({ length: 12 }, (_, i) => ({
      numeroLigne: 4 + i,
      cin: `C${i}`,
      nomPrenom: `N${i}`,
      champ: i < 9 ? 'chantier' : 'fonction',
      raison: i < 9 ? 'Chantier introuvable : C999' : 'Fonction introuvable : X'
    }));
    service.analyserImport.mockReturnValue(of({ ...ANALYSE, erreurs, chantiersClotures: [], cinInconnus: [], ecarts: [] }));
    await analyser();

    const cartes = Array.from(dialogue().querySelectorAll('.app-controle__carte'));
    expect(cartes).toHaveLength(2);
    expect(cartes[0].textContent).toContain('Chantier absent, inconnu ou clôturé');
    expect(cartes[0].textContent).toContain('9');
    expect(cartes[0].textContent).toContain('Exemple, ligne 4');
    expect(dialogue().querySelector('stp-table')).toBeNull();
    (cartes[0].querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(dialogue().querySelectorAll('stp-table')).toHaveLength(1);
  });

  it('sans le droit d’écrire les employés, ne propose que de corriger le fichier', async () => {
    await ouvrir(['PAIE_IMPORT', 'PAIE_READ']);
    await analyser();
    expect(dialogue().textContent).toContain('Vous ne pouvez pas modifier les fiches des employés');
    regler({ erreurs: [] });
    expect(dialogue().querySelector('button[aria-label^="Rouvrir le chantier"]')).toBeNull();
    expect(dialogue().textContent).toContain('Vous ne pouvez pas modifier les chantiers');
    regler({ chantiersClotures: [] });
    regler({ cinInconnus: [] });
    expect(dialogue().querySelector('button[aria-label^="Mettre à jour la fiche"]')).toBeNull();
    expect(Array.from(dialogue().querySelectorAll('button')).some((b) => b.textContent?.includes('Créer l’employé') || b.textContent?.includes("Créer l'employé"))).toBe(false);
  });
});
