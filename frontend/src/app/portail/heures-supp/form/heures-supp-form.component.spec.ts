import { Component, input, model } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { fournirSignalForms } from '../../../shared/forms/signal-forms.config';
import { fournirRoute } from '../../../shared/testing/ecrans';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { EmployeeReferenceService } from '../../../shared/reference-data/employee-reference.service';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { HeuresSupp } from '../models/heures-supp.model';
import { HeuresSuppService } from '../services/heures-supp.service';
import { HeuresSuppFormComponent } from './heures-supp-form.component';

@Component({ selector: 'app-lazy-select', standalone: true, template: '' })
class LazySelectStub {
  readonly ariaLabel = input<string | null>(null);
  readonly placeholder = input('');
  readonly optionLabel = input('');
  readonly inputId = input<string | null>(null);
  readonly source = input<unknown>();
  readonly value = model<unknown>(null);
}

const LIGNE: HeuresSupp = {
  id: 1, version: 0, employeeId: 7, nomPrenom: 'Salma Alaoui', cin: 'AB123', fonction: 'Chauffeur', chantierId: 4,
  codeChantier: 'C4', chantier: 'Site', periode: '2026-10', salaireReferenceDh: 4000, typeSalaireReference: 'MENSUEL',
  salaireHoraireDh: 15.38, heuresSupplementaires: 2, montantDh: 30.76, stcOuSortie: false, stcDh: 0, forfaitDh: 100,
  netAPayerDh: 130.76
};

describe('HeuresSuppFormComponent', () => {
  let fixture: ComponentFixture<HeuresSuppFormComponent>;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let router: Router;
  const formulaire = () => fixture.componentInstance['form'];

  async function stabiliser(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function afficher(id?: string, chargement = of(LIGNE)): Promise<void> {
    service = {
      get: vi.fn().mockReturnValue(chargement),
      creer: vi.fn().mockReturnValue(of(LIGNE)),
      modifier: vi.fn().mockReturnValue(of(LIGNE))
    };
    const reference = { fetchPage: () => of({ items: [], totalRecords: 0 }), fetchById: (value: number) => of({ id: value, nomPrenom: 'Salma Alaoui', cin: 'AB123', displayLabel: 'Salma Alaoui — AB123' }) };
    TestBed.configureTestingModule({ providers: [
      provideRouter([]), fournirSignalForms(), fournirRoute(id ? { id } : {}),
      { provide: HeuresSuppService, useValue: service },
      { provide: EmployeeReferenceService, useValue: reference },
      { provide: ChantierReferenceService, useValue: reference }
    ] });
    TestBed.overrideComponent(HeuresSuppFormComponent, { remove: { imports: [LazySelectComponent] }, add: { imports: [LazySelectStub] } });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(HeuresSuppFormComponent);
    await stabiliser();
  }

  it('uses the dedicated create screen and validates the minimum data before creation', async () => {
    await afficher();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Ajouter une ligne');
    expect(fixture.nativeElement.querySelector('.heures-supp-ajout')).toBeNull();
    const form = formulaire();
    form.employeeId().value.set(7);
    form.periode().value.set(new Date(2026, 9, 1));
    form.chantierId().value.set(4);
    form.heuresSupplementaires().value.set(2);
    await stabiliser();

    fixture.componentInstance['enregistrer']();

    expect(service['creer']).toHaveBeenCalledWith({ employeeId: 7, periode: '2026-10', chantierId: 4, heuresSupplementaires: 2, forfaitDh: null });
    expect(router.navigate).toHaveBeenCalledWith(['/heures-supp'], { queryParams: { periode: '2026-10' } });
  });

  it('loads historical context and updates only hours and forfait on the edit screen', async () => {
    await afficher('1');
    expect(service['get']).toHaveBeenCalledWith(1);
    expect(fixture.nativeElement.textContent).toContain('AB123');
    expect(fixture.nativeElement.textContent).toContain('15.38 DH/h');
    expect(fixture.nativeElement.textContent).toContain('4,000.00 DH');
    const form = formulaire();
    form.heuresSupplementaires().value.set(3);
    await stabiliser();

    fixture.componentInstance['enregistrer']();

    expect(service['modifier']).toHaveBeenCalledWith(1, { version: 0, heuresSupplementaires: 3, forfaitDh: 100 });
  });

  it('shows server errors for an uneditable or missing line', async () => {
    await afficher('1', throwError(() => new Error('offline')));
    expect(fixture.nativeElement.textContent).toContain('Cette ligne n’a pas pu être chargée');
    expect(service['modifier']).not.toHaveBeenCalled();
  });
});
