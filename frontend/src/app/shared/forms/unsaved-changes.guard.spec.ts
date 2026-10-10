import type { MockedObject } from "vitest";
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ConfirmDialogService } from '@shared/feedback/feedback.service';
import { firstValueFrom, isObservable, Observable } from 'rxjs';

import { FormulaireProtege, unsavedChangesGuard } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
    let confirmation: MockedObject<ConfirmDialogService>;

    function ecran(modifie: boolean): FormulaireProtege {
        const formulaire = TestBed.runInInjectionContext(() => form(signal({ nom: '' })));
        if (modifie) {
            formulaire().markAsDirty();
        }
        return { form: formulaire };
    }

    function garder(composant: FormulaireProtege): boolean | Observable<boolean> {
        return TestBed.runInInjectionContext(() => unsavedChangesGuard(composant, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, {} as RouterStateSnapshot) as boolean | Observable<boolean>);
    }

    beforeEach(() => {
        confirmation = {
            confirm: vi.fn().mockName("ConfirmDialogService.confirm")
        } as unknown as MockedObject<ConfirmDialogService>;
        TestBed.configureTestingModule({ providers: [{ provide: ConfirmDialogService, useValue: confirmation }] });
    });

    it('laisse partir sans question un formulaire intact', () => {
        expect(garder(ecran(false))).toBe(true);
        expect(confirmation.confirm).not.toHaveBeenCalled();
    });

    it('demande confirmation quand le formulaire est modifié, puis laisse partir si on confirme', async () => {
        confirmation.confirm.mockImplementation((c) => c.accept?.());

        const reponse = garder(ecran(true));

        expect(isObservable(reponse)).toBe(true);
        expect(await firstValueFrom(reponse as Observable<boolean>)).toBe(true);
        expect(confirmation.confirm).toHaveBeenCalledWith(expect.objectContaining({ header: 'Quitter sans enregistrer ?', acceptLabel: 'Quitter', rejectLabel: 'Rester' }));
    });

    it('retient l\'utilisateur sur son formulaire quand il choisit de rester', async () => {
        confirmation.confirm.mockImplementation((c) => c.reject?.());

        expect(await firstValueFrom(garder(ecran(true)) as Observable<boolean>)).toBe(false);
    });

    it('ne pose plus de question une fois le formulaire enregistré (remis à l\'état intact)', () => {
        const composant = ecran(true);
        composant.form().reset();

        expect(garder(composant)).toBe(true);
    });
});
