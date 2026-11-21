import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EtatVue, EtatVueLocal, EtatVueUrl } from './etat-vue';

@Component({ standalone: true, changeDetection: ChangeDetectionStrategy.Eager, template: 'vue' })
class VueFactice {}

describe('EtatVue', () => {
  describe('dans l’URL (page classique)', () => {
    let harness: RouterTestingHarness;

    beforeEach(async () => {
      TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'paie', component: VueFactice }])] });
      harness = await RouterTestingHarness.create();
    });

    it('est le fournisseur par défaut et lit les paramètres de l’URL', async () => {
      await harness.navigateByUrl('/paie?periode=2026-07&chantierIds=3,4');
      const etat = TestBed.inject(EtatVue);

      expect(etat).toBeInstanceOf(EtatVueUrl);
      expect(etat.params().get('periode')).toBe('2026-07');
      expect(etat.params().get('chantierIds')).toBe('3,4');
    });

    it('fusionne une modification avec l’URL et retire un paramètre `null`', async () => {
      await harness.navigateByUrl('/paie?periode=2026-07&cin=AB1');
      const etat = TestBed.inject(EtatVue);

      etat.modifier({ nom: 'ali', cin: null });
      await harness.fixture.whenStable();

      expect(TestBed.inject(Router).url).toBe('/paie?periode=2026-07&nom=ali');
      expect(etat.params().get('nom')).toBe('ali');
      expect(etat.params().has('cin')).toBe(false);
    });

    it('empile l’historique par défaut et le remplace sur demande', async () => {
      await harness.navigateByUrl('/paie?periode=2026-07');
      const etat = TestBed.inject(EtatVue);
      const navigation = vi.spyOn(TestBed.inject(Router), 'navigate');

      etat.modifier({ nom: 'a' });
      etat.modifier({ nom: 'ab' }, { remplacer: true });

      expect(navigation.mock.calls[0][1]).toEqual(expect.objectContaining({ replaceUrl: false, queryParamsHandling: 'merge' }));
      expect(navigation.mock.calls[1][1]).toEqual(expect.objectContaining({ replaceUrl: true, queryParamsHandling: 'merge' }));
    });
  });

  describe('en mémoire (vue intégrée dans la conversation)', () => {
    it('part de l’état donné, convertit en texte et ignore les valeurs vides', () => {
      const etat = new EtatVueLocal({ periode: '2026-07', page: 2, vide: null });

      expect(etat.params().get('periode')).toBe('2026-07');
      expect(etat.params().get('page')).toBe('2');
      expect(etat.params().has('vide')).toBe(false);
    });

    it('fusionne une modification et retire un paramètre `null` ou `undefined`', () => {
      const etat = new EtatVueLocal({ periode: '2026-07', cin: 'AB1', nom: 'ali' });

      etat.modifier({ cin: null, nom: undefined, chantierIds: '3,4' });

      expect(etat.params().keys.sort()).toEqual(['chantierIds', 'periode']);
      expect(etat.params().get('chantierIds')).toBe('3,4');
    });

    it('garde les valeurs multiples', () => {
      const etat = new EtatVueLocal({ selection: ['a', 'b'] });

      expect(etat.params().getAll('selection')).toEqual(['a', 'b']);
    });

    it('deux vues ne se piétinent pas et aucune n’écrit dans l’URL', async () => {
      TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'paie', component: VueFactice }])] });
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/paie?periode=2026-01');
      const octobre = new EtatVueLocal({ periode: '2026-10' });
      const septembre = new EtatVueLocal({ periode: '2026-09' });

      octobre.modifier({ chantierIds: '144' });

      expect(septembre.params().has('chantierIds')).toBe(false);
      expect(septembre.params().get('periode')).toBe('2026-09');
      expect(TestBed.inject(Router).url).toBe('/paie?periode=2026-01');
    });
  });
});
