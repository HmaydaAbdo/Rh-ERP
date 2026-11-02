import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AgentStore, CopilotChat, CopilotChatConfiguration, CopilotKit, CopilotkitAgentFactory } from '@copilotkit/angular';

import { FilAssistant } from './fil-assistant.service';
import { AssistantChatComponent } from './assistant-chat.component';

type Abonne = Parameters<AgentStore['agent']['subscribe']>[0];

describe('AssistantChatComponent', () => {
  let abonne: Abonne | undefined;
  let utilise: boolean;
  const marquerUtilise = vi.fn();
  const connectAgent = vi.fn();

  beforeEach(async () => {
    abonne = undefined;
    utilise = false;
    marquerUtilise.mockClear();
    connectAgent.mockReset().mockResolvedValue(undefined);
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
        { provide: FilAssistant, useValue: { fil: signal('u1-test'), estUtilise: () => utilise, marquerUtilise } },
        { provide: CopilotKit, useValue: { core: { connectAgent } } },
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

  it('laisse l’accueil de CopilotKit à un fil neuf : fil donné à la configuration, non explicite', () => {
    const fixture = TestBed.createComponent(AssistantChatComponent);
    fixture.detectChanges();
    const configuration = fixture.debugElement.injector.get(CopilotChatConfiguration);

    expect(configuration.threadId()).toBe('u1-test');
    expect(configuration.hasExplicitThreadId()).toBe(false);
  });

  it('reprend l’historique d’un fil déjà commencé : fil explicite', () => {
    utilise = true;
    const fixture = TestBed.createComponent(AssistantChatComponent);
    fixture.detectChanges();
    const configuration = fixture.debugElement.injector.get(CopilotChatConfiguration);

    expect(configuration.threadId()).toBe('u1-test');
    expect(configuration.hasExplicitThreadId()).toBe(true);
  });

  it('enregistre que la conversation a commencé au premier run, sans changer le fil en cours', () => {
    const fixture = TestBed.createComponent(AssistantChatComponent);
    fixture.detectChanges();
    const configuration = fixture.debugElement.injector.get(CopilotChatConfiguration);

    abonne?.onRunStartedEvent?.({} as Parameters<NonNullable<Abonne['onRunStartedEvent']>>[0]);
    fixture.detectChanges();

    expect(marquerUtilise).toHaveBeenCalledTimes(1);
    expect(configuration.hasExplicitThreadId()).toBe(false);
  });

  const demarrer = () => abonne?.onRunStartedEvent?.({} as Parameters<NonNullable<Abonne['onRunStartedEvent']>>[0]);
  const finaliser = () => abonne?.onRunFinalized?.({} as Parameters<NonNullable<Abonne['onRunFinalized']>>[0]);

  it('se rattache au fil quand le flux d’un run se termine sans événement final', () => {
    const fixture = TestBed.createComponent(AssistantChatComponent);
    fixture.detectChanges();

    demarrer();
    finaliser();

    expect(connectAgent).toHaveBeenCalledTimes(1);
    finaliser();
    expect(connectAgent).toHaveBeenCalledTimes(1);
  });

  it('ne se rattache pas quand le run s’est terminé, a échoué ou a été annulé par l’utilisateur', () => {
    const fixture = TestBed.createComponent(AssistantChatComponent);
    fixture.detectChanges();

    demarrer();
    abonne?.onRunFinishedEvent?.({} as Parameters<NonNullable<Abonne['onRunFinishedEvent']>>[0]);
    finaliser();
    demarrer();
    abonne?.onRunErrorEvent?.({} as Parameters<NonNullable<Abonne['onRunErrorEvent']>>[0]);
    finaliser();
    demarrer();
    abonne?.onRunFailed?.({ error: Object.assign(new Error('interrompu'), { name: 'AbortError' }) } as unknown as Parameters<NonNullable<Abonne['onRunFailed']>>[0]);
    finaliser();

    expect(connectAgent).not.toHaveBeenCalled();
  });
});
