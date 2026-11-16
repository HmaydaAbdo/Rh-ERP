import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { criteresMontres, etatConsultation } from './carte-outil';
import { CarteOutilComponent } from './carte-outil.component';

describe('présentation d’une consultation', () => {
  it('déduit l’état de l’appel et du résultat', () => {
    expect(etatConsultation('in-progress', undefined)).toBe('en-cours');
    expect(etatConsultation('executing', undefined)).toBe('en-cours');
    expect(etatConsultation('complete', '{"masse":4800}')).toBe('terminee');
    expect(etatConsultation('complete', 'Access Denied : PAIE_READ')).toBe('refusee');
    expect(etatConsultation('complete', 'Accès refusé')).toBe('refusee');
    expect(etatConsultation('complete', 'L’outil `paie_indicateurs` a échoué (TimeoutError).')).toBe('echec');
  });

  it('ne montre que des critères non personnels, en français', () => {
    expect(
      criteresMontres({ periode: '2026-08', chantierIds: '3,4,5', equipeIds: [1], cin: 'AB123456', nom: 'Ali', recherche: 'x', page: 2 })
    ).toEqual([
      { libelle: 'Période', valeur: '2026-08' },
      { libelle: 'Chantiers', valeur: '3 sélectionnés' },
      { libelle: 'Équipes', valeur: '1 sélectionné' }
    ]);
    expect(criteresMontres(undefined)).toEqual([]);
  });
});

describe('CarteOutilComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  async function creer(appel: Record<string, unknown>) {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CarteOutilComponent);
    (fixture.componentRef as ComponentRef<CarteOutilComponent>).setInput('toolCall', appel);
    fixture.detectChanges();
    http.expectOne('ia/outils').flush([{ name: 'paie_indicateurs', title: 'Indicateurs de paie d’un mois', domain: 'Paie' }]);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('affiche le titre français, le domaine, l’état et les critères, jamais le nom technique', async () => {
    const element = await creer({ name: 'paie_indicateurs', status: 'complete', args: { periode: '2026-08' }, result: '{"masse":4800}' });
    expect(element.textContent).toContain('Indicateurs de paie d’un mois');
    expect(element.textContent).toContain('Paie');
    expect(element.textContent).toContain('Consultation terminée');
    expect(element.textContent).toContain('2026-08');
    expect(element.textContent).not.toContain('paie_indicateurs');
    expect(element.textContent).not.toContain('4800');
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Consultation terminée');
  });

  it('un outil inconnu a une carte générique sans son nom technique', async () => {
    const element = await creer({ name: 'outil_inconnu', status: 'in-progress', args: {}, result: undefined });
    expect(element.textContent).toContain('Consultation des données');
    expect(element.textContent).toContain('Consultation en cours');
    expect(element.textContent).not.toContain('outil_inconnu');
  });

  it('signale un refus d’accès', async () => {
    const element = await creer({ name: 'paie_indicateurs', status: 'complete', args: {}, result: 'Access Denied' });
    expect(element.textContent).toContain('Accès refusé');
  });

  it('n’affiche rien pour un outil interne de l’agent', async () => {
    const element = await creer({ name: 'write_todos', status: 'complete', args: {}, result: 'ok' });
    expect(element.querySelector('details')).toBeNull();
  });
});
