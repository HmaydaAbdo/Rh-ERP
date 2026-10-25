import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirSignalForms } from '../../../shared/forms/signal-forms.config';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EmployeeReferenceService } from '../../../shared/reference-data/employee-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { fournirRoute } from '../../../shared/testing/ecrans';
import { soumettre } from '../../../shared/testing/formulaire';
import { Paie } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieFormComponent } from './paie-form.component';

const referentiel = (libelle: (id: number) => object) => ({ fetchPage: () => of({ items: [], totalRecords: 0 }), fetchById: (id: number) => of({ id, ...libelle(id) }) });

const BULLETIN: Paie = {
  id: 8,
  version: 0,
  employee: { id: 9, nomPrenom: 'Ali Alaoui', cin: 'AB123' },
  periode: '2026-08',
  fonction: { id: 1, libelle: 'MACON' },
  chantier: { id: 2, code: 'C196', designation: 'Marrakech' },
  equipe: { id: 3, code: 'CH', libelle: 'Chauffeurs' },
  nombreJoursTravailles: 26,
  joursRecuperationOuvrable: 1.5,
  joursRecuperationDimanche: null,
  salaireMensuel: 4000,
  primeRoulageOrdinaire: 120.5,
  primeRoulageDimanche: null,
  salaireTotal: 4350.5,
  observation: 'Heures de nuit'
};

describe('PaieFormComponent', () => {
  let fixture: ComponentFixture<PaieFormComponent>;
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

  async function afficher(id?: string, chargement: Observable<Paie> = of(BULLETIN)): Promise<void> {
    service = {
      getById: vi.fn().mockReturnValue(chargement),
      create: vi.fn().mockReturnValue(of({ id: 40 })),
      update: vi.fn().mockReturnValue(of({ id: 8 }))
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        fournirSignalForms(),
        fournirRoute(id ? { id } : {}),
        { provide: PaieService, useValue: service },
        { provide: EmployeeReferenceService, useValue: referentiel(() => ({ nomPrenom: 'Ali Alaoui', cin: 'AB123', displayLabel: 'Ali Alaoui — AB123' })) },
        { provide: FunctionReferenceService, useValue: referentiel(() => ({ libelle: 'MACON' })) },
        { provide: ChantierReferenceService, useValue: referentiel(() => ({ code: 'C196' })) },
        { provide: EquipeReferenceService, useValue: referentiel(() => ({ code: 'CH', libelle: 'Chauffeurs' })) }
      ]
    });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(PaieFormComponent);
    await stabiliser();
  }

  async function envoyer(): Promise<void> {
    soumettre(racine());
    await stabiliser();
  }

  async function remplirObligatoires(): Promise<void> {
    const f = formulaire();
    f.employeeId().value.set(9);
    f.periode().value.set(new Date(2026, 7, 1));
    f.fonctionId().value.set(1);
    f.chantierId().value.set(2);
    f.nombreJoursTravailles().value.set(26);
    f.salaireMensuel().value.set(4000);
    f.salaireTotal().value.set(4350.5);
    await stabiliser();
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove()));

  describe('création', () => {
    it('présente trois sections et sept champs obligatoires', async () => {
      await afficher();

      expect(racine().querySelector('h1')?.textContent).toBe('Nouveau bulletin de paie');
      expect(Array.from(racine().querySelectorAll('.app-form__section h2')).map((h) => h.textContent)).toEqual(['Affectation', 'Jours', 'Rémunération']);
      expect(racine().querySelectorAll('.field__req')).toHaveLength(7);
      expect(racine().querySelector('stp-message')).toBeNull();
    });

    it('affiche le statut facultatif des champs également facultatifs dans l’import mensuel', async () => {
      await afficher();

      const statutDesChamps = [
        ['equipeId', 'Équipe (facultative)'],
        ['joursRecuperationOuvrable', 'Jours récup. ouvrable (facultatifs)'],
        ['joursRecuperationDimanche', 'Jours récup. dimanche (facultatifs)'],
        ['primeRoulageOrdinaire', 'Prime roulage ordinaire (facultative)'],
        ['primeRoulageDimanche', 'Prime roulage dimanche (facultative)'],
        ['observation', 'Observation (facultative)']
      ];

      for (const [id, libelle] of statutDesChamps) {
        expect(racine().querySelector(`label[for="${id}"]`)?.textContent).toContain(libelle);
      }
      expect(racine().querySelectorAll('.field__req')).toHaveLength(7);
    });

    it('refuse un formulaire vide : chaque champ obligatoire est signalé, le focus va à l’employé', async () => {
      await afficher();

      await envoyer();

      expect(service.create).not.toHaveBeenCalled();
      expect(erreurs()).toEqual([
        "L'employé est obligatoire.",
        'La période est obligatoire.',
        'La fonction est obligatoire.',
        'Le chantier est obligatoire.',
        'Le nombre de jours travaillés est obligatoire.',
        'Le salaire mensuel est obligatoire.',
        'Le salaire total est obligatoire.'
      ]);
      expect(document.activeElement?.id).toBe('employeeId');
    });

    it('refuse un montant négatif', async () => {
      await afficher();
      await remplirObligatoires();
      formulaire().salaireMensuel().value.set(-10);
      formulaire().salaireMensuel().markAsTouched();
      await stabiliser();

      await envoyer();

      expect(service.create).not.toHaveBeenCalled();
      expect(erreurs()).toEqual(['La valeur ne peut pas être négative.']);
    });

    it.each([
      ['joursRecuperationOuvrable', 1000], ['joursRecuperationDimanche', 1.001],
      ['primeRoulageOrdinaire', 100000000], ['primeRoulageDimanche', 1.001], ['salaireTotal', 100000000]
    ] as const)('refuse %s hors des bornes et de la précision du contrat', async (champ, valeur) => {
      await afficher();
      await remplirObligatoires();
      formulaire()[champ]().value.set(valeur);
      formulaire()[champ]().markAsTouched();

      await envoyer();

      expect(service.create).not.toHaveBeenCalled();
      expect(erreurs()).toHaveLength(1);
    });

    it('refuse une observation de plus de 255 caractères', async () => {
      await afficher();
      await remplirObligatoires();
      formulaire().observation().value.set('x'.repeat(256));
      formulaire().observation().markAsTouched();

      await envoyer();

      expect(service.create).not.toHaveBeenCalled();
      expect(erreurs()).toEqual(['L’observation est limitée à 255 caractères.']);
    });

    it('ramène à zéro un montant négatif saisi, en quittant le champ (borne de la règle du schéma)', async () => {
      await afficher();
      const champ = racine().querySelector('input#salaireMensuel') as HTMLInputElement;

      champ.dispatchEvent(new Event('focus'));
      champ.value = '-50';
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      champ.dispatchEvent(new Event('blur'));
      await stabiliser();

      expect(formulaire().salaireMensuel().value()).toBe(0);
      expect(champ.value).toBe('0,00');
    });

    it('crée le bulletin : période au format aaaa-mm, champs facultatifs absents envoyés comme tels', async () => {
      await afficher();
      await remplirObligatoires();
      formulaire().nombreJoursTravailles().value.set(26.5);

      await envoyer();

      expect(service.create).toHaveBeenCalledWith({
        employeeId: 9,
        periode: '2026-08',
        fonctionId: 1,
        chantierId: 2,
        equipeId: null,
        nombreJoursTravailles: 26.5,
        joursRecuperationOuvrable: null,
        joursRecuperationDimanche: null,
        salaireMensuel: 4000,
        primeRoulageOrdinaire: null,
        primeRoulageDimanche: null,
        salaireTotal: 4350.5,
        observation: null
      });
      expect(TestBed.inject(NotificationService).notifications()[0].summary).toBe('Bulletin créé');
      expect(navigation).toHaveBeenCalledWith(['/paie', 40]);
      expect(formulaire()().dirty()).toBe(false);
    });

    it('envoie les champs facultatifs renseignés et l’équipe choisie', async () => {
      await afficher();
      await remplirObligatoires();
      formulaire().equipeId().value.set(3);
      formulaire().joursRecuperationOuvrable().value.set(1.5);
      formulaire().primeRoulageDimanche().value.set(80);
      formulaire().observation().value.set('Heures de nuit');

      await envoyer();

      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ equipeId: 3, joursRecuperationOuvrable: 1.5, primeRoulageDimanche: 80, observation: 'Heures de nuit' })
      );
      expect(racine().textContent).toContain("met aussi à jour l'équipe sur la fiche de l'employé");
    });

    it('enregistre le choix Orphelins sans équipe et n’envoie pas son identifiant synthétique', async () => {
      await afficher();
      await remplirObligatoires();
      formulaire().equipeId().value.set(0);

      await envoyer();

      expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ equipeId: null }));
    });

    it('reste sur le formulaire quand le serveur refuse (bulletin déjà existant pour cet employé et ce mois)', async () => {
      await afficher();
      service.create.mockReturnValue(throwError(() => new Error('409')));
      await remplirObligatoires();

      await envoyer();

      expect(navigation).not.toHaveBeenCalled();
      expect(formulaire()().dirty()).toBe(false);
      expect(TestBed.inject(NotificationService).notifications()).toEqual([]);
    });
  });

  describe('modification', () => {
    it('attend le bulletin puis propose de réessayer en cas d’échec, sans formulaire vide', async () => {
      const chargement = new Subject<Paie>();
      await afficher('8', chargement);
      expect(racine().textContent).toContain('Chargement du bulletin…');
      expect(racine().querySelector('form')).toBeNull();

      chargement.error(new Error('indisponible'));
      await stabiliser();
      expect(erreurs()).toHaveLength(1);
      expect(racine().querySelector('form')).toBeNull();
      expect(service.update).not.toHaveBeenCalled();

      service.getById.mockReturnValue(of(BULLETIN));
      (racine().querySelector('stp-message button') as HTMLButtonElement).click();
      await stabiliser();
      expect(racine().querySelector('form')).not.toBeNull();
      expect((racine().querySelector('input#observation') as HTMLInputElement).value).toBe('Heures de nuit');
    });

    it('charge le bulletin, affiche les libellés choisis et prévient que l’employé et la période sont figés', async () => {
      await afficher('8');

      expect(service.getById).toHaveBeenCalledWith(8);
      expect(racine().querySelector('h1')?.textContent).toBe('Modifier le bulletin');
      expect(racine().querySelector('stp-message')?.textContent).toContain('ne sont pas modifiables après création');
      expect((racine().querySelector('input#employeeId') as HTMLInputElement).value).toBe('Ali Alaoui — AB123');
      expect((racine().querySelector('button#periode') as HTMLButtonElement).textContent).toContain('08/2026');
      expect((racine().querySelector('input#fonctionId') as HTMLInputElement).value).toBe('MACON');
      expect((racine().querySelector('input#chantierId') as HTMLInputElement).value).toBe('C196');
      expect((racine().querySelector('input#equipeId') as HTMLInputElement).value).toBe('CH · Chauffeurs');
      expect((racine().querySelector('input#observation') as HTMLInputElement).value).toBe('Heures de nuit');
      expect(formulaire()().dirty()).toBe(false);
    });

    it('verrouille l’employé et la période', async () => {
      await afficher('8');

      expect(racine().querySelector('input#employeeId')?.getAttribute('aria-disabled')).toBe('true');
      expect((racine().querySelector('button#periode') as HTMLButtonElement).disabled).toBe(true);
      expect((racine().querySelector('input#fonctionId') as HTMLInputElement).getAttribute('aria-disabled')).toBe('false');
    });

    it('affiche les montants au format français', async () => {
      await afficher('8');

      expect((racine().querySelector('input#salaireTotal') as HTMLInputElement).value.replace(/\s/g, ' ')).toBe('4 350,50');
      expect((racine().querySelector('input#nombreJoursTravailles') as HTMLInputElement).value).toBe('26');
    });

    it('enregistre sans renvoyer l’employé ni la période', async () => {
      await afficher('8');
      formulaire().salaireTotal().value.set(4500);
      formulaire().observation().value.set('');

      await envoyer();

      expect(service.update).toHaveBeenCalledWith(8, {
        version: 0,
        fonctionId: 1,
        chantierId: 2,
        equipeId: 3,
        nombreJoursTravailles: 26,
        joursRecuperationOuvrable: 1.5,
        joursRecuperationDimanche: null,
        salaireMensuel: 4000,
        primeRoulageOrdinaire: 120.5,
        primeRoulageDimanche: null,
        salaireTotal: 4500,
        observation: null
      });
      expect(TestBed.inject(NotificationService).notifications()[0].summary).toBe('Bulletin modifié');
      expect(navigation).toHaveBeenCalledWith(['/paie', 8]);
    });
  });
});
