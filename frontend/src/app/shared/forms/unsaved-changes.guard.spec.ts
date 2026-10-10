import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ConfirmDialogService } from '@shared/feedback/feedback.service';
import { firstValueFrom, isObservable, Observable } from 'rxjs';

import { FormulaireProtege, unsavedChangesGuard } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
  let confirmation: jasmine.SpyObj<ConfirmDialogService>;

  function ecran(modifie: boolean): FormulaireProtege {
    const form = new FormGroup({ nom: new FormControl('') });
    if (modifie) {
      form.markAsDirty();
    }
    return { form };
  }

  function garder(composant: FormulaireProtege): boolean | Observable<boolean> {
    return TestBed.runInInjectionContext(
      () => unsavedChangesGuard(composant, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, {} as RouterStateSnapshot) as boolean | Observable<boolean>
    );
  }

  beforeEach(() => {
    confirmation = jasmine.createSpyObj<ConfirmDialogService>('ConfirmDialogService', ['confirm']);
    TestBed.configureTestingModule({ providers: [{ provide: ConfirmDialogService, useValue: confirmation }] });
  });

  it('laisse partir sans question un formulaire intact', () => {
    expect(garder(ecran(false))).toBeTrue();
    expect(confirmation.confirm).not.toHaveBeenCalled();
  });

  it('demande confirmation quand le formulaire est modifié, puis laisse partir si on confirme', async () => {
    confirmation.confirm.and.callFake((c) => c.accept?.());

    const reponse = garder(ecran(true));

    expect(isObservable(reponse)).toBeTrue();
    expect(await firstValueFrom(reponse as Observable<boolean>)).toBeTrue();
    expect(confirmation.confirm).toHaveBeenCalledWith(
      jasmine.objectContaining({ header: 'Quitter sans enregistrer ?', acceptLabel: 'Quitter', rejectLabel: 'Rester' })
    );
  });

  it('retient l\'utilisateur sur son formulaire quand il choisit de rester', async () => {
    confirmation.confirm.and.callFake((c) => c.reject?.());

    expect(await firstValueFrom(garder(ecran(true)) as Observable<boolean>)).toBeFalse();
  });

  it('ne pose plus de question une fois le formulaire enregistré (remis à l\'état intact)', () => {
    const composant = ecran(true);
    composant.form.markAsPristine();

    expect(garder(composant)).toBeTrue();
  });
});
