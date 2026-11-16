import { TestBed } from '@angular/core/testing';
import { COPILOT_KIT_CONFIG, CopilotKit } from '@copilotkit/angular';
import { vi } from 'vitest';

import { CapacitesAssistant, messagePiece, PIECES_JOINTES } from './capacites-assistant.service';

function info(capabilities?: object): Response {
  return new Response(JSON.stringify({ version: '1.80.0', agents: { default: { name: 'default', description: '', ...(capabilities ? { capabilities } : {}) } }, mode: 'sse' }), {
    headers: { 'content-type': 'application/json' }
  });
}

async function attendre(valeur: () => boolean): Promise<void> {
  await vi.waitFor(() => expect(valeur()).toBe(true));
}

describe('CapacitesAssistant', () => {
  afterEach(() => vi.restoreAllMocks());

  function demarrer(reponse: Response): CapacitesAssistant {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => reponse.clone());
    TestBed.configureTestingModule({ providers: [{ provide: COPILOT_KIT_CONFIG, useValue: { runtimeUrl: 'http://localhost/ia/copilotkit', enableInspector: false } }] });
    TestBed.inject(CopilotKit);
    return TestBed.inject(CapacitesAssistant);
  }

  it('garde les pièces jointes fermées tant que l’agent ne les déclare pas', async () => {
    const service = demarrer(info());
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    expect(service.pieces().enabled).toBe(false);
  });

  it('ouvre images, PDF, texte et CSV de 500 Mo au plus quand l’agent déclare accepter les fichiers', async () => {
    const service = demarrer(info({ multimodal: { input: { image: true, pdf: true, file: true } } }));

    await attendre(() => service.pieces().enabled);

    expect(service.pieces()).toMatchObject({ enabled: true, accept: PIECES_JOINTES.accept, maxSize: 500 * 1024 * 1024 });
    expect(PIECES_JOINTES.accept).not.toMatch(/svg|zip|audio|video|html/);
  });

  it('dit en français pourquoi un fichier est refusé', () => {
    expect(messagePiece('file-too-large')).toBe('Ce fichier dépasse 500 Mo.');
    expect(messagePiece('invalid-type')).toContain('n’est pas accepté');
    expect(messagePiece('upload-failed')).toContain('n’a pas pu être ajouté');
  });
});
