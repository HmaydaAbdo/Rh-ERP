import { TestBed } from '@angular/core/testing';

import { MessageComponent, MessageSeverity } from './message.component';

describe('MessageComponent', () => {
  function afficher(severite: MessageSeverity, texte: string) {
    const fixture = TestBed.createComponent(MessageComponent);
    fixture.componentRef.setInput('severity', severite);
    fixture.componentRef.setInput('text', texte);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('affiche le texte avec une icône décorative', () => {
    const message = afficher('info', 'Un bulletin est un document historique.');

    expect(message.textContent).toContain('Un bulletin est un document historique.');
    expect(message.querySelector('stp-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(message.className).toContain('stp-message--info');
  });

  it('annonce une erreur comme une alerte, et un avis comme un statut', () => {
    expect(afficher('error', 'Échec').getAttribute('role')).toBe('alert');
    expect(afficher('warn', 'Attention').getAttribute('role')).toBe('status');
    expect(afficher('info', 'Avis').getAttribute('role')).toBe('status');
  });

  it('porte la classe de sa sévérité', () => {
    expect(afficher('warn', 'x').className).toContain('stp-message--warn');
    expect(afficher('error', 'x').className).toContain('stp-message--error');
  });
});
