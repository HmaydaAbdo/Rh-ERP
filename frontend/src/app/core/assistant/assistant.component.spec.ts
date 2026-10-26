import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { COPILOT_KIT_CONFIG } from '@copilotkit/angular';

import { AssistantComponent } from './assistant.component';

describe('AssistantComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: COPILOT_KIT_CONFIG, useValue: { enableInspector: false } }]
    });
  });

  function creer() {
    const fixture = TestBed.createComponent(AssistantComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('s’ouvre et se ferme avec Ctrl K, sans laisser la touche à la page', () => {
    const fixture = creer();
    const assistant = fixture.componentInstance;
    const evenement = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });

    assistant.raccourci(evenement);
    expect(assistant.ouvert()).toBe(true);
    expect(evenement.defaultPrevented).toBe(true);

    assistant.raccourci(new KeyboardEvent('keydown', { key: 'K', metaKey: true }));
    expect(assistant.ouvert()).toBe(false);
  });

  it('ignore les autres touches', () => {
    const assistant = creer().componentInstance;

    assistant.raccourci(new KeyboardEvent('keydown', { key: 'k' }));
    assistant.raccourci(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }));

    expect(assistant.ouvert()).toBe(false);
  });

  it('suit le thème : la classe dark de la bibliothèque est posée en thème sombre', () => {
    const fixture = creer();
    const hote = fixture.nativeElement as HTMLElement;

    const sombre = document.documentElement.dataset['theme'] === 'dark' || hote.classList.contains('dark');
    expect(hote.classList.contains('dark')).toBe(sombre);
  });
});
