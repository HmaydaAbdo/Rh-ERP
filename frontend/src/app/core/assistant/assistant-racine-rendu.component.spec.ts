import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { COPILOT_KIT_CONFIG } from '@copilotkit/angular';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { AuthService } from '../auth/services/auth.service';
import { AssistantRacineComponent } from './assistant-racine.component';

describe('AssistantRacineComponent', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      version: '1.80.0', agents: { default: { name: 'default', description: '' } }, mode: 'sse'
    }), { headers: { 'content-type': 'application/json' } }));
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['http://localhost:4300/', 'http://localhost:4300/ia/copilotkit'],
    ['http://staport.dyndns.org:650/erp-rh/', 'http://staport.dyndns.org:650/erp-rh/ia/copilotkit'],
    ['https://staport.example/autre/erp/', 'https://staport.example/autre/erp/ia/copilotkit']
  ])('monte l’assistant avec le runtime résolu depuis %s', async (base, attendu) => {
    vi.spyOn(document, 'baseURI', 'get').mockReturnValue(base);
    const auth = { getAccessToken: () => 'jeton', refreshOnce: () => of({}) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });

    const fixture = TestBed.createComponent(AssistantRacineComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('app-assistant-interne')).not.toBeNull();
    const assistant = fixture.debugElement.query(By.css('app-assistant-interne'));
    expect(assistant.injector.get(COPILOT_KIT_CONFIG).runtimeUrl).toBe(attendu);
  });
});
