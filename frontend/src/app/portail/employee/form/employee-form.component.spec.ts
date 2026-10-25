import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirSignalForms } from '../../../shared/forms/signal-forms.config';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { fournirPermissions, fournirRoute } from '../../../shared/testing/ecrans';
import { saisir, soumettre } from '../../../shared/testing/formulaire';
import { Employee } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';
import { EmployeeFormComponent } from './employee-form.component';

const FONCTIONS = [
  { id: 1, libelle: 'MACON' },
  { id: 3, libelle: 'CHAUFFEUR' }
];
const CHANTIERS = [
  { id: 2, code: 'C196', designation: 'Marrakech', actif: true },
  { id: 4, code: 'C168', designation: 'Nador', actif: true }
];
const referentiel = <T extends { id: number }>(items: T[]) => ({
  fetchPage: () => of({ items, totalRecords: items.length }),
  fetchById: (id: number) => of(items.find((i) => i.id === Number(id))!)
});

const EMPLOYE: Employee = {
  id: 9,
  version: 0,
  nomPrenom: 'Ali Alaoui',
  cin: 'AB123',
  dateNaissance: '1990-03-07',
  dateEmbauche: '2020-11-02',
  fonction: { id: 1, libelle: 'MACON' },
  chantier: { id: 2, code: 'C196' },
  equipe: null,
  salaire: null,
  typeSalaire: null,
  statut: 'ACTIF'
};

describe('EmployeeFormComponent', () => {
  let fixture: ComponentFixture<EmployeeFormComponent>;
  let service: { getById: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const erreurs = () => Array.from(racine().querySelectorAll('[role="alert"]')).map((e) => e.textContent);
  const formulaire = () => fixture.componentInstance['form'];

  async function stabiliser(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function afficher(id?: string, permissions: string[] = ['EMPLOYEE_WRITE']): Promise<void> {
    service = {
      getById: vi.fn().mockReturnValue(of(EMPLOYE)),
      create: vi.fn().mockReturnValue(of({ id: 15 })),
      update: vi.fn().mockReturnValue(of({ id: 9 }))
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        fournirSignalForms(),
        fournirRoute(id ? { id } : {}),
        fournirPermissions(permissions).providers,
        { provide: EquipeReferenceService, useValue: {
          fetchPage: () => of({ items: [
            { id: 5, code: 'OP', libelle: 'Opérateurs' },
            { id: 0, code: '', libelle: 'Orphelins (sans équipe)' }
          ], totalRecords: 2 }),
          fetchById: (id: number) => of(Number(id) === 0
            ? { id: 0, code: '', libelle: 'Orphelins (sans équipe)' }
            : { id, code: 'OP', libelle: 'Opérateurs' })
        } },
        { provide: EmployeeService, useValue: service },
        { provide: FunctionReferenceService, useValue: referentiel(FONCTIONS) },
        { provide: ChantierReferenceService, useValue: referentiel(CHANTIERS) }
      ]
    });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(EmployeeFormComponent);
    await stabiliser();
  }

  async function envoyer(): Promise<void> {
    soumettre(racine());
    await stabiliser();
  }

  async function remplir(): Promise<void> {
    saisir(racine(), '#nomPrenom', 'Zahra Idrissi');
    saisir(racine(), '#cin', 'CD456');
    saisir(racine(), 'input#dateNaissance', '1985-01-31');
    saisir(racine(), 'input#dateEmbauche', '2018-05-14');
    formulaire().fonctionId().value.set(3);
    formulaire().chantierId().value.set(4);
    await stabiliser();
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove()));

  describe('création', () => {
    it('présente les six champs obligatoires et pas de choix du statut', async () => {
      await afficher();

      expect(racine().querySelector('h1')?.textContent).toBe('Nouvel employé');
      expect(racine().querySelectorAll('.field__req')).toHaveLength(6);
      expect(racine().querySelector('#statut')).toBeNull();
    });

    it('refuse un formulaire vide : chaque champ obligatoire est signalé, le focus va au premier', async () => {
      await afficher();

      await envoyer();

      expect(service.create).not.toHaveBeenCalled();
      expect(erreurs()).toEqual([
        'Le nom et prénom sont obligatoires.',
        'Le CIN est obligatoire.',
        'La date de naissance est obligatoire.',
        "La date d'embauche est obligatoire.",
        'La fonction est obligatoire.',
        'Le chantier est obligatoire.'
      ]);
      expect(document.activeElement?.id).toBe('nomPrenom');
    });

    it('limite le nom à 150 caractères et le CIN à 30', async () => {
      await afficher();

      expect(racine().querySelector('#nomPrenom')?.getAttribute('maxlength')).toBe('150');
      expect(racine().querySelector('#cin')?.getAttribute('maxlength')).toBe('30');
    });

    it('envoie le focus au premier champ composé invalide (date) quand les textes sont remplis', async () => {
      await afficher();
      saisir(racine(), '#nomPrenom', 'Zahra Idrissi');
      saisir(racine(), '#cin', 'CD456');

      await envoyer();

      expect(document.activeElement?.id).toBe('dateNaissance');
    });

    it('crée l’employé : dates au format ISO, fonction et chantier par identifiant', async () => {
      await afficher();
      await remplir();

      await envoyer();

      expect(service.create).toHaveBeenCalledWith({
        nomPrenom: 'Zahra Idrissi',
        cin: 'CD456',
        dateNaissance: '1985-01-31',
        dateEmbauche: '2018-05-14',
        fonctionId: 3,
        chantierId: 4,
        equipeId: null,
        salaire: null,
        typeSalaire: null
      });
      expect(TestBed.inject(NotificationService).notifications()[0].summary).toBe('Employé créé');
      expect(navigation).toHaveBeenCalledWith(['/employees', 15]);
      expect(formulaire()().dirty()).toBe(false);
    });

    it('enregistre le choix Orphelins comme une absence d’équipe, sans envoyer son identifiant synthétique', async () => {
      await afficher();
      await remplir();
      formulaire().equipeId().value.set(0);

      await envoyer();

      expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ equipeId: null }));
    });

    it('affiche le libellé de la fonction et du chantier choisis', async () => {
      await afficher();
      await remplir();

      expect((racine().querySelector('input#fonctionId') as HTMLInputElement).value).toBe('CHAUFFEUR');
      expect((racine().querySelector('input#chantierId') as HTMLInputElement).value).toBe('C168 · Nador');
    });

    it('reste sur le formulaire quand le serveur refuse (CIN déjà utilisé)', async () => {
      await afficher();
      service.create.mockReturnValue(throwError(() => new Error('409')));
      await remplir();

      await envoyer();

      expect(navigation).not.toHaveBeenCalled();
      expect(formulaire()().dirty()).toBe(true);
    });
  });

  describe('équipe et salaire', () => {
    it('ne propose le salaire qu’à qui peut lire la paie', async () => {
      await afficher();
      expect(racine().querySelector('#equipeId')).not.toBeNull();
      expect(racine().querySelector('#salaire')).toBeNull();

      TestBed.resetTestingModule();
      await afficher(undefined, ['EMPLOYEE_WRITE', 'PAIE_READ']);
      expect(racine().querySelector('#salaire')).not.toBeNull();
      expect(racine().querySelector('#typeSalaire')).not.toBeNull();
    });

    it('refuse un salaire sans son type, puis envoie l’équipe, le salaire et le type ensemble', async () => {
      await afficher(undefined, ['EMPLOYEE_WRITE', 'PAIE_READ']);
      await remplir();
      formulaire().salaire().value.set(120);

      await envoyer();
      expect(service.create).not.toHaveBeenCalled();
      expect(erreurs()).toContain('Renseignez le salaire et son type ensemble.');

      formulaire().typeSalaire().value.set('JOURNALIER');
      formulaire().equipeId().value.set(5);
      await envoyer();
      expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ equipeId: 5, salaire: 120, typeSalaire: 'JOURNALIER' }));
    });
  });

  describe('modification', () => {
    it('charge l’employé de l’adresse dans tous les champs, y compris le statut', async () => {
      await afficher('9');

      expect(service.getById).toHaveBeenCalledWith(9);
      expect(racine().querySelector('h1')?.textContent).toBe("Modifier l'employé");
      expect((racine().querySelector('#nomPrenom') as HTMLInputElement).value).toBe('Ali Alaoui');
      expect((racine().querySelector('input#dateNaissance') as HTMLInputElement).value).toBe('1990-03-07');
      expect((racine().querySelector('input#dateEmbauche') as HTMLInputElement).value).toBe('2020-11-02');
      expect((racine().querySelector('input#fonctionId') as HTMLInputElement).value).toBe('MACON');
      expect((racine().querySelector('input#chantierId') as HTMLInputElement).value).toBe('C196 · Marrakech');
      expect((racine().querySelector('input#statut') as HTMLInputElement).value).toBe('En poste');
      expect(formulaire()().dirty()).toBe(false);
    });

    it('enregistre les changements avec le statut', async () => {
      await afficher('9');
      saisir(racine(), '#cin', 'AB999');
      formulaire().statut().value.set('INACTIF');
      await stabiliser();
      expect(racine().querySelector('#chantierId')).toBeNull();
      expect(racine().querySelector('#equipeId')).toBeNull();

      await envoyer();

      expect(service.update).toHaveBeenCalledWith(9, {
        version: 0,
        nomPrenom: 'Ali Alaoui',
        cin: 'AB999',
        dateNaissance: '1990-03-07',
        dateEmbauche: '2020-11-02',
        fonctionId: 1,
        chantierId: null,
        equipeId: null,
        salaire: null,
        typeSalaire: null,
        statut: 'INACTIF'
      });
      expect(TestBed.inject(NotificationService).notifications()[0].summary).toBe('Employé modifié');
      expect(navigation).toHaveBeenCalledWith(['/employees', 9]);
    });
  });
});
