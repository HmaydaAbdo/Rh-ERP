import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { AuthService } from '../auth/services/auth.service';
import { AssistantRacineComponent } from './assistant-racine.component';

describe('racine de l’assistant : contrat de production de CopilotKit (KAN-97)', () => {
  it('détruit son injecteur d’environnement avec le composant, pour que les services de la bibliothèque se nettoient', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), { provide: AuthService, useValue: { getAccessToken: () => null, refreshOnce: () => undefined } }]
    });
    TestBed.overrideComponent(AssistantRacineComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(AssistantRacineComponent);
    const injecteur = (fixture.componentInstance as unknown as { injecteur: { destroyed: boolean } }).injecteur;

    expect(injecteur.destroyed).toBe(false);
    fixture.destroy();

    expect(injecteur.destroyed).toBe(true);
  });

  it('coupe l’inspecteur de la bibliothèque (KAN-98) : il ne se monte qu’en développement, et la configuration le refuse en plus', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), { provide: AuthService, useValue: { getAccessToken: () => null, refreshOnce: () => undefined } }]
    });
    TestBed.overrideComponent(AssistantRacineComponent, { set: { template: '' } });
    const composant = TestBed.createComponent(AssistantRacineComponent).componentInstance as unknown as { configuration(): { enableInspector?: boolean } };

    expect(composant.configuration().enableInspector).toBe(false);
  });
});
