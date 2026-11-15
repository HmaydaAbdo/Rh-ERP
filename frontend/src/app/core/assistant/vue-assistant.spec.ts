import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { validerVue } from './vue-assistant';
import { VueAssistantComponent } from './vue-assistant.component';

describe('validerVue', () => {
  it('construit l’adresse d’une vue filtrée connue', () => {
    expect(validerVue('paie', { periode: '2026-08', chantierIds: '3,4' })).toMatchObject({
      libelleDomaine: 'Paie',
      url: '/paie?periode=2026-08&chantierIds=3%2C4'
    });
    expect(validerVue('chantiers', undefined)?.url).toBe('/chantiers');
  });

  it('refuse tout domaine, filtre ou valeur hors liste', () => {
    expect(validerVue('admin', {})).toBeNull();
    expect(validerVue('__proto__', {})).toBeNull();
    expect(validerVue('paie', { cin: 'AB123456' })).toBeNull();
    expect(validerVue('paie', { periode: { a: 1 } })).toBeNull();
    expect(validerVue('paie', { periode: 'x'.repeat(101) })).toBeNull();
    expect(validerVue('paie', ['periode'])).toBeNull();
    expect(validerVue(42, {})).toBeNull();
  });
});

describe('VueAssistantComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'paie', children: [] }, { path: 'depart', children: [] }])]
    });
  });

  function creer(appel: Record<string, unknown>) {
    const fixture = TestBed.createComponent(VueAssistantComponent);
    (fixture.componentRef as ComponentRef<VueAssistantComponent>).setInput('toolCall', appel);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('n’ouvre rien seule : un clic ouvre la vue, « Revenir » ramène à l’écran d’origine', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/depart');
    const { fixture, element } = creer({ name: 'proposer_vue', status: 'complete', args: { domaine: 'paie', filtres: { periode: '2026-08' } } });
    expect(router.url).toBe('/depart');
    expect(element.textContent).toContain('Paie');
    expect(element.querySelector('.revenir')).toBeNull();

    (element.querySelector('.ouvrir') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/paie?periode=2026-08');

    (element.querySelector('.revenir') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(router.url).toBe('/depart');
  });

  it('une proposition invalide n’affiche rien', () => {
    const { element } = creer({ name: 'proposer_vue', status: 'complete', args: { domaine: 'admin' } });
    expect(element.querySelector('.ouvrir')).toBeNull();
  });
});
