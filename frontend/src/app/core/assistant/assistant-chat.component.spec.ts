import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AgentStore, CopilotChat, CopilotkitAgentFactory } from '@copilotkit/angular';

import { FilAssistant } from './fil-assistant.service';
import { AssistantChatComponent } from './assistant-chat.component';

type Abonne = Parameters<AgentStore['agent']['subscribe']>[0];

describe('AssistantChatComponent', () => {
  let abonne: Abonne | undefined;

  beforeEach(async () => {
    abonne = undefined;
    const agent = {
      subscribe: (valeur: Abonne) => {
        abonne = valeur;
        return { unsubscribe: vi.fn() };
      }
    } as unknown as AgentStore['agent'];
    const magasin = { agent } as AgentStore;

    await TestBed.configureTestingModule({
      imports: [AssistantChatComponent],
      providers: [
        { provide: FilAssistant, useValue: { fil: signal('u1-test') } },
        { provide: CopilotkitAgentFactory, useValue: { createAgentStoreSignal: () => signal(magasin) } }
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    })
      .overrideComponent(AssistantChatComponent, {
        remove: { imports: [CopilotChat] },
        add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] }
      })
      .compileComponents();
  });

  it('affiche une erreur lisible et la retire quand un nouveau run démarre', () => {
    const fixture = TestBed.createComponent(AssistantChatComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    abonne?.onRunErrorEvent?.({} as Parameters<NonNullable<Abonne['onRunErrorEvent']>>[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('réessayez');

    abonne?.onRunStartedEvent?.({} as Parameters<NonNullable<Abonne['onRunStartedEvent']>>[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('n’affiche pas une annulation utilisateur comme une panne fournisseur', () => {
    const fixture = TestBed.createComponent(AssistantChatComponent);
    fixture.detectChanges();
    const annulation = Object.assign(new Error('interrompu'), { name: 'AbortError' });
    abonne?.onRunFailed?.({ error: annulation } as unknown as Parameters<NonNullable<Abonne['onRunFailed']>>[0]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });
});
