import { TestBed } from '@angular/core/testing';

import { decisions, lireDemandes } from './accord-ecriture';
import { AccordEcritureComponent } from './accord-ecriture.component';

const INTERRUPTION = JSON.stringify({
  action_requests: [{ name: 'write_file', args: { file_path: '/espace/rapport.md', content: 'Masse de septembre' } }],
  review_configs: [{ action_name: 'write_file', allowed_decisions: ['approve', 'reject'] }]
});

describe('accord avant écriture', () => {
  it('lit les demandes dans la valeur JSON de l’interruption et ignore le reste', () => {
    expect(lireDemandes(INTERRUPTION)).toEqual([
      { outil: 'write_file', chemin: '/espace/rapport.md', contenu: 'Masse de septembre' }
    ]);
    expect(lireDemandes('pas du json')).toEqual([]);
    expect(lireDemandes(undefined)).toEqual([]);
    expect(lireDemandes({ autre: 1 })).toEqual([]);
  });

  it('répond une décision par demande, dans l’ordre', () => {
    const demandes = lireDemandes(INTERRUPTION);

    expect(decisions(demandes, true)).toEqual({ decisions: [{ type: 'approve' }] });
    expect(decisions(demandes, false).decisions[0]).toMatchObject({ type: 'reject' });
  });

  describe('AccordEcritureComponent', () => {
    function monter() {
      const fixture = TestBed.createComponent(AccordEcritureComponent);
      fixture.componentRef.setInput('demandes', lireDemandes(INTERRUPTION));
      const decision = vi.fn();
      fixture.componentInstance.decision.subscribe(decision);
      fixture.detectChanges();
      return { fixture, page: fixture.nativeElement as HTMLElement, decision };
    }

    it('montre le chemin et le contenu avant tout accord', () => {
      const { page } = monter();

      expect(page.querySelector('.chemin')?.textContent).toContain('/espace/rapport.md');
      expect(page.querySelector('.apercu')?.textContent).toContain('Masse de septembre');
    });

    it('émet l’approbation une seule fois et masque les boutons', () => {
      const { fixture, page, decision } = monter();

      (page.querySelector('.approuver') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(decision).toHaveBeenCalledExactlyOnceWith(true);
      expect(page.querySelector('.approuver')).toBeNull();
      expect(page.querySelector('.reponse')?.textContent).toContain('approuvée');
    });

    it('émet le refus', () => {
      const { page, decision } = monter();

      (page.querySelector('.refuser') as HTMLButtonElement).click();

      expect(decision).toHaveBeenCalledWith(false);
    });
  });
});
