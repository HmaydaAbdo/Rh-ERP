import { of } from 'rxjs';

import { configurationAssistant } from './assistant-config';

const auth = { getAccessToken: () => 'jeton', refreshOnce: () => of({ accessToken: 'jeton', utilisateur: null }) } as never;

describe('configuration de CopilotKit', () => {
  it('coupe l’inspecteur de la bibliothèque (KAN-98) : il ne se monte qu’en développement, et la configuration le refuse en plus', () => {
    expect(configurationAssistant(auth, document).enableInspector).toBe(false);
  });

  it.each([
    ['http://localhost:4300/', 'http://localhost:4300/ia/copilotkit'],
    ['http://staport.dyndns.org:650/erp-rh/', 'http://staport.dyndns.org:650/erp-rh/ia/copilotkit']
  ])('résout le runtime depuis la base Angular %s', (base, attendu) => {
    const doc = { baseURI: base } as Document;

    expect(configurationAssistant(auth, doc).runtimeUrl).toBe(attendu);
  });
});
