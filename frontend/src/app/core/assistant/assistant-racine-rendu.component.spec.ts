import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../auth/services/auth.service';
import { AssistantRacineComponent, URL_RUNTIME } from './assistant-racine.component';

describe('AssistantRacineComponent', () => {
  it('monte l’assistant dans son injecteur CopilotKit, sans configuration à la racine', () => {
    const auth = { getAccessToken: () => 'jeton', refreshOnce: () => of({}) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });

    const fixture = TestBed.createComponent(AssistantRacineComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-assistant-interne')).not.toBeNull();
    expect(URL_RUNTIME).toBe('/ia/copilotkit');
  });
});
