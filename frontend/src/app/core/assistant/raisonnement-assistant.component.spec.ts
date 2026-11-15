import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { dureeReflexion } from './raisonnement-assistant';
import { RaisonnementAssistantComponent } from './raisonnement-assistant.component';

describe('dureeReflexion', () => {
  it('écrit la durée en français', () => {
    expect(dureeReflexion(0.2)).toBe('moins d’une seconde');
    expect(dureeReflexion(Number.NaN)).toBe('moins d’une seconde');
    expect(dureeReflexion(4.4)).toBe('4 s');
    expect(dureeReflexion(60)).toBe('1 min');
    expect(dureeReflexion(65)).toBe('1 min 5 s');
  });
});

describe('RaisonnementAssistantComponent', () => {
  const message = (content: string) => ({ id: 'p1', role: 'reasoning', content });

  function creer(contenu: string, enCours: boolean) {
    const fixture = TestBed.createComponent(RaisonnementAssistantComponent);
    const ref = fixture.componentRef as ComponentRef<RaisonnementAssistantComponent>;
    ref.setInput('message', message(contenu));
    ref.setInput('messages', [message(contenu)]);
    ref.setInput('isRunning', enCours);
    fixture.detectChanges();
    return { fixture, ref, element: fixture.nativeElement as HTMLElement };
  }
  const bouton = (element: HTMLElement) => element.querySelector('button') as HTMLButtonElement;

  it('pendant la réflexion : libellé français, texte visible', () => {
    const { element } = creer('Je consulte les indicateurs de paie.', true);
    expect(element.textContent).toContain('Réflexion en cours…');
    expect(element.textContent).toContain('Je consulte les indicateurs de paie.');
    expect(element.textContent).not.toContain('Thinking');
    expect(bouton(element).getAttribute('aria-expanded')).toBe('true');
  });

  it('une fois terminée : repliée, avec la durée, et dépliable par l’utilisateur', () => {
    const { fixture, ref, element } = creer('Je consulte les indicateurs de paie.', true);
    ref.setInput('isRunning', false);
    fixture.detectChanges();

    expect(element.textContent).toContain('Réflexion de moins d’une seconde');
    expect(element.textContent).not.toContain('Je consulte');
    expect(bouton(element).getAttribute('aria-expanded')).toBe('false');

    bouton(element).click();
    fixture.detectChanges();
    expect(element.textContent).toContain('Je consulte les indicateurs de paie.');
    expect(bouton(element).getAttribute('aria-expanded')).toBe('true');
  });

  it('sans texte : pas de repli', () => {
    const { element } = creer('', true);
    expect(bouton(element).disabled).toBe(true);
    expect(bouton(element).hasAttribute('aria-expanded')).toBe(false);
  });
});
