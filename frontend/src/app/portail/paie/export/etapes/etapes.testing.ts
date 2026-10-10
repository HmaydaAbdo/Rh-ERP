import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { PaieChantierPeriode, PaieMaterielTableau, PaiePeriodeResume } from '../../models/paie.model';
import { PaieService } from '../../services/paie.service';
import { PaieExportStore } from '../paie-export.store';

/** Aides des tests d'étape de l'assistant d'export : l'étape est montée avec le vrai `PaieExportStore` (comme dans l'assistant). */

export const PERIODES: PaiePeriodeResume[] = [
  { periode: '2026-09', nombreBulletins: 50, nombreChantiers: 2, masse: 250000, stc: 1 },
  { periode: '2026-08', nombreBulletins: 969, nombreChantiers: 3, masse: 5500000.5, stc: 12 }
];

export const CHANTIERS: PaieChantierPeriode[] = [
  {
    id: 1,
    code: 'C168',
    libelle: 'Nador',
    effectif: 10,
    masse: 100,
    equipes: [
      { id: 1, code: 'CH', libelle: 'Chauffeurs', effectif: 6, masse: 60 },
      { id: 2, code: 'OP', libelle: 'Opérateurs', effectif: 4, masse: 40 }
    ]
  },
  { id: 2, code: 'C196', libelle: null, effectif: 5, masse: 50, equipes: [{ id: 3, code: 'LABO', libelle: 'Labo', effectif: 5, masse: 50 }] },
  { id: 3, code: 'C057', libelle: 'Dépôt', effectif: 2, masse: 20, equipes: [] }
];

export const TABLEAUX: PaieMaterielTableau[] = [{ chantierCode: 'C168', equipeCode: 'CH', titre: 'Camions C168', libelles: ['Camion benne', 'Camion citerne'] }];

/** `preparer` fixe l'état de l'assistant avant que l'étape ne soit affichée (certaines étapes n'existent que si cet état le permet). */
export async function monterEtape<T>(composant: Type<T>, preparer?: (store: PaieExportStore) => void): Promise<{ fixture: ComponentFixture<T>; store: PaieExportStore; racine: HTMLElement }> {
  const service = {
    listerPeriodes: vi.fn().mockReturnValue(of(PERIODES)),
    listerChantiersDeLaPeriode: vi.fn().mockReturnValue(of(CHANTIERS)),
    listerTableauxMateriel: vi.fn().mockReturnValue(of(TABLEAUX))
  };
  TestBed.configureTestingModule({ providers: [PaieExportStore, { provide: PaieService, useValue: service }] });
  const store = TestBed.inject(PaieExportStore);
  preparer?.(store);
  const fixture = TestBed.createComponent(composant);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, store, racine: fixture.nativeElement as HTMLElement };
}

export async function stabiliser(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}
