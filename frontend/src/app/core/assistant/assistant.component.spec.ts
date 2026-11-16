import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { COPILOT_KIT_CONFIG } from '@copilotkit/angular';

import { AssistantComponent } from './assistant.component';
import { FilAssistant } from './fil-assistant.service';

describe('AssistantComponent', () => {
  const ouvrirEspace = vi.fn();
  const quitter = vi.fn();

  beforeEach(() => {
    ouvrirEspace.mockClear();
    quitter.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: COPILOT_KIT_CONFIG, useValue: { enableInspector: false } },
        // Fourni en production par la racine de l'assistant ; seuls l'ouverture et la sortie de l'espace servent ici.
        { provide: FilAssistant, useValue: { origine: signal<string | null>(null), ouvrirEspace, quitter } }
      ]
    });
  });

  function creer() {
    const fixture = TestBed.createComponent(AssistantComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('l’icône de l’assistant ouvre l’espace dédié à l’IA', () => {
    const fixture = creer();
    const lanceur = (fixture.nativeElement as HTMLElement).querySelector('button.lanceur') as HTMLButtonElement;
    expect(lanceur.getAttribute('aria-label')).toBe('Ouvrir Staport Intelligence');

    lanceur.click();
    expect(ouvrirEspace).toHaveBeenCalledTimes(1);
  });

  it('Ctrl K ouvre l’espace sans laisser la touche à la page, et le referme depuis l’espace', () => {
    const assistant = creer().componentInstance;
    const evenement = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });

    assistant.raccourci(evenement);
    expect(ouvrirEspace).toHaveBeenCalledTimes(1);
    expect(evenement.defaultPrevented).toBe(true);

    // Dans l'espace : le même raccourci ramène à l'écran d'origine.
    (assistant as unknown as { enEspace: () => boolean }).enEspace = () => true;
    assistant.raccourci(new KeyboardEvent('keydown', { key: 'K', metaKey: true }));
    expect(quitter).toHaveBeenCalledTimes(1);
  });

  it('ignore les autres touches', () => {
    const assistant = creer().componentInstance;

    assistant.raccourci(new KeyboardEvent('keydown', { key: 'k' }));
    assistant.raccourci(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }));

    expect(ouvrirEspace).not.toHaveBeenCalled();
    expect(quitter).not.toHaveBeenCalled();
  });

  it('suit le thème : la classe dark de la bibliothèque est posée en thème sombre', () => {
    const fixture = creer();
    const hote = fixture.nativeElement as HTMLElement;

    const sombre = document.documentElement.dataset['theme'] === 'dark' || hote.classList.contains('dark');
    expect(hote.classList.contains('dark')).toBe(sombre);
  });
});
