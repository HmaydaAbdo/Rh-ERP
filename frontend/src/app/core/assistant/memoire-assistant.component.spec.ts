import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MemoireAssistantComponent } from './memoire-assistant.component';
import { MemoireAssistant } from './memoire-assistant.service';

describe('MemoireAssistantComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  async function creer(contenu = '- Je suis responsable du chantier Atlas.') {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MemoireAssistantComponent);
    fixture.detectChanges();
    http.expectOne('ia/memoire').flush({ contenu, modifie: contenu ? '2026-11-15T10:00:00Z' : null });
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, http, element: fixture.nativeElement as HTMLElement };
  }
  const champ = (element: HTMLElement) => element.querySelector('textarea') as HTMLTextAreaElement;
  const bouton = (element: HTMLElement, libelle: string) =>
    element.querySelector(`button[aria-label="${libelle}"]`) as HTMLButtonElement;

  it('affiche ce que l’assistant retient', async () => {
    const { element } = await creer();
    expect(champ(element).value).toBe('- Je suis responsable du chantier Atlas.');
    expect(element.textContent).toContain('Modifié le');
  });

  it('enregistre le texte corrigé puis recharge', async () => {
    const { fixture, http, element } = await creer();
    champ(element).value = '- Je préfère les montants en MAD.';
    champ(element).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const enregistrer = Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.includes('Enregistrer'))!;
    enregistrer.click();
    const requete = http.expectOne('ia/memoire');
    expect(requete.request.method).toBe('PUT');
    expect(requete.request.body).toEqual({ contenu: '- Je préfère les montants en MAD.' });
    requete.flush(null);
    await fixture.whenStable();
    http.expectOne('ia/memoire').flush({ contenu: '- Je préfère les montants en MAD.', modifie: null });
    await fixture.whenStable();
    expect(TestBed.inject(MemoireAssistant).contenu()).toBe('- Je préfère les montants en MAD.');
  });

  it('demande confirmation avant de tout oublier', async () => {
    const { fixture, http, element } = await creer();
    bouton(element, 'Tout oublier').click();
    fixture.detectChanges();
    http.expectNone('ia/memoire');
    bouton(element, 'Confirmer l’oubli').click();
    const requete = http.expectOne('ia/memoire');
    expect(requete.request.method).toBe('DELETE');
    requete.flush(null);
    await fixture.whenStable();
    http.expectOne('ia/memoire').flush({ contenu: '', modifie: null });
    await fixture.whenStable();
    expect(TestBed.inject(MemoireAssistant).contenu()).toBe('');
  });

  it('annule l’oubli sans rien envoyer', async () => {
    const { fixture, http, element } = await creer();
    bouton(element, 'Tout oublier').click();
    fixture.detectChanges();
    bouton(element, 'Annuler').click();
    fixture.detectChanges();
    http.expectNone('ia/memoire');
    expect(bouton(element, 'Tout oublier')).toBeTruthy();
  });
});
