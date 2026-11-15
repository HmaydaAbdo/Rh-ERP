import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Conversation, FilAssistant } from './fil-assistant.service';
import { ListeConversationsComponent } from './liste-conversations.component';

describe('ListeConversationsComponent', () => {
  const conversations = signal<Conversation[]>([]);
  const fil = {
    conversations,
    fil: signal('u1-a'),
    rafraichir: vi.fn(),
    ouvrir: vi.fn(),
    renommer: vi.fn(),
    supprimer: vi.fn()
  };

  beforeEach(() => {
    fil.rafraichir.mockReset();
    fil.ouvrir.mockReset();
    fil.renommer.mockReset().mockResolvedValue(undefined);
    fil.supprimer.mockReset().mockResolvedValue(undefined);
    conversations.set([
      { id: 'u1-a', title: 'Masse salariale', createdAt: 1, updatedAt: 1_700_000_000_000 },
      { id: 'u1-b', title: 'Effectifs', createdAt: 1, updatedAt: 1_600_000_000_000 }
    ]);
    TestBed.configureTestingModule({ providers: [{ provide: FilAssistant, useValue: fil }] });
  });

  function creer() {
    const fixture = TestBed.createComponent(ListeConversationsComponent);
    fixture.detectChanges();
    return fixture;
  }
  const element = (fixture: ReturnType<typeof creer>) => fixture.nativeElement as HTMLElement;
  const bouton = (fixture: ReturnType<typeof creer>, libelle: string) =>
    element(fixture).querySelector(`button[aria-label="${libelle}"]`) as HTMLButtonElement;

  it('charge la liste à l’ouverture et affiche les titres', () => {
    const fixture = creer();
    expect(fil.rafraichir).toHaveBeenCalled();
    const titres = Array.from(element(fixture).querySelectorAll('li .truncate')).map((e) => e.textContent?.trim());
    expect(titres).toEqual(['Masse salariale', 'Effectifs']);
  });

  it('reprend la conversation choisie', () => {
    const fixture = creer();
    (element(fixture).querySelectorAll('button.ouvrir')[1] as HTMLButtonElement).click();
    expect(fil.ouvrir).toHaveBeenCalledWith('u1-b');
  });

  it('renomme avec Entrée', async () => {
    const fixture = creer();
    bouton(fixture, 'Renommer la conversation').click();
    fixture.detectChanges();
    const champ = element(fixture).querySelector('input') as HTMLInputElement;
    await fixture.whenStable();
    expect(champ.value).toBe('Masse salariale');
    champ.value = '  Paie de septembre ';
    champ.dispatchEvent(new Event('input'));
    champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(fil.renommer).toHaveBeenCalledWith('u1-a', 'Paie de septembre');
  });

  it('demande confirmation avant de supprimer, et peut annuler', async () => {
    const fixture = creer();
    bouton(fixture, 'Supprimer la conversation').click();
    fixture.detectChanges();
    expect(element(fixture).textContent).toContain('Supprimer définitivement ?');
    expect(fil.supprimer).not.toHaveBeenCalled();

    bouton(fixture, 'Annuler').click();
    fixture.detectChanges();
    expect(element(fixture).textContent).not.toContain('Supprimer définitivement ?');

    bouton(fixture, 'Supprimer la conversation').click();
    fixture.detectChanges();
    bouton(fixture, 'Confirmer la suppression').click();
    await fixture.whenStable();
    expect(fil.supprimer).toHaveBeenCalledWith('u1-a');
  });

  it('indique une liste vide', () => {
    conversations.set([]);
    expect(element(creer()).textContent).toContain('Aucune conversation pour le moment.');
  });
});
