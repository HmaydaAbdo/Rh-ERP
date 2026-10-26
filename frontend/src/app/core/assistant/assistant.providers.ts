import type { CopilotKit } from '@copilotkit/angular';
import { z } from 'zod';

import type { AuthService } from '../auth/services/auth.service';
import { IDENTIFIANT_AGENT, creerAgentIa } from './assistant-agent';
import { AssistantOutilComponent } from './assistant-outil.component';
import { AssistantPlanComponent, type ArgumentsPlan } from './assistant-plan.component';

/**
 * Branche l'agent AG-UI de l'assistant et ses rendus sur CopilotKit (API publique `updateRuntime` et `addRenderToolCall`) :
 * le plan de l'agent en liste cochée, toute autre consultation d'outil en une ligne.
 */
export function brancherAssistant(copilot: CopilotKit, auth: AuthService): void {
  copilot.updateRuntime({ selfManagedAgents: { [IDENTIFIANT_AGENT]: creerAgentIa(auth) } });
  copilot.addRenderToolCall({
    name: 'write_todos',
    args: z.object({ todos: z.array(z.object({ content: z.string(), status: z.enum(['pending', 'in_progress', 'completed']) })) }) as z.ZodType<ArgumentsPlan>,
    component: AssistantPlanComponent
  });
  copilot.addRenderToolCall({ name: '*', args: z.record(z.string(), z.unknown()), component: AssistantOutilComponent });
}
