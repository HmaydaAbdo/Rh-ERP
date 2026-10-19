import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { saisir } from '../../../shared/testing/formulaire';
import { AUCUN_FILTRE, EmployeeFiltres } from './employee-filtres';
import { EmployeeFiltresComponent } from './employee-filtres.component';

const REFERENTIEL = { fetchPage: () => of({ items: [], totalRecords: 0 }), fetchById: (id: number) => of({ id, code: 'C' + id, libelle: 'L' + id }) };

describe('EmployeeFiltresComponent', () => {
  let fixture: ComponentFixture<EmployeeFiltresComponent>;
  let emis: EmployeeFiltres[];
  const racine = () => fixture.nativeElement as HTMLElement;
  const formulaire = () => fixture.componentInstance['formulaire'];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: FunctionReferenceService, useValue: REFERENTIEL },
        { provide: ChantierReferenceService, useValue: REFERENTIEL },
        { provide: EquipeReferenceService, useValue: REFERENTIEL }
      ]
    });
    fixture = TestBed.createComponent(EmployeeFiltresComponent);
    fixture.componentRef.setInput('value', { ...AUCUN_FILTRE, chantierIds: [2] });
    fixture.detectChanges();
    emis = [];
    fixture.componentInstance.valueChange.subscribe((filtres) => emis.push(filtres));
  });

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove());
  });

  it('affiche les filtres reçus sans les renvoyer', () => {
    TestBed.tick();

    expect(formulaire().chantierIds().value()).toEqual([2]);
    expect(emis).toEqual([]);
  });

  it('émet le nom et le CIN après un court délai, en une fois', async () => {
    vi.useFakeTimers();

    saisir(racine(), 'input[aria-label="Nom & prénom"]', 'ali');
    saisir(racine(), 'input[aria-label="CIN"]', 'AB1');
    await vi.advanceTimersByTimeAsync(350);
    TestBed.tick();

    expect(emis.at(-1)).toEqual({ ...AUCUN_FILTRE, chantierIds: [2], nomPrenom: 'ali', cin: 'AB1' });
  });

  it('émet sans attendre les fonctions, les chantiers et le statut', () => {
    formulaire().fonctionIds().value.set([1, 3]);
    formulaire().statut().value.set('INACTIF');
    TestBed.tick();

    expect(emis.at(-1)).toEqual({ ...AUCUN_FILTRE, fonctionIds: [1, 3], chantierIds: [2], statut: 'INACTIF' });
  });

  it('« Réinitialiser » vide tous les filtres', () => {
    (Array.from(racine().querySelectorAll('button')).find((b) => b.textContent?.includes('Réinitialiser')) as HTMLButtonElement).click();
    TestBed.tick();

    expect(emis.at(-1)).toEqual(AUCUN_FILTRE);
  });
});
