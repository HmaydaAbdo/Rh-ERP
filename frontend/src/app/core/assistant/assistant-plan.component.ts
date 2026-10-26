import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AngularToolCall, ToolRenderer } from '@copilotkit/angular';
import { LucideCheck, LucideCircle, LucideListChecks } from '@lucide/angular';

export interface TachePlan {
  readonly content: string;
  readonly status: 'pending' | 'in_progress' | 'completed';
}

export interface ArgumentsPlan extends Record<string, unknown> {
  readonly todos: readonly TachePlan[];
}

/**
 * Le plan de l'agent (outil `write_todos` du `TodoListMiddleware`), affiché comme une liste cochée qui avance au fil du
 * travail, à la manière des assistants de référence : une demande à plusieurs étapes montre ses étapes et leur état.
 */
@Component({
  selector: 'app-assistant-plan',
  imports: [LucideCheck, LucideCircle, LucideListChecks],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (taches().length > 0) {
      <section class="plan" aria-label="Plan de l’assistant">
        <header class="plan__entete">
          <svg lucideListChecks aria-hidden="true"></svg>
          <h3 class="plan__titre">Plan</h3>
          <span class="plan__avancement">{{ terminees() }} / {{ taches().length }}</span>
        </header>
        <ol class="plan__liste">
          @for (tache of taches(); track $index) {
            <li class="plan__tache" [class.plan__tache--faite]="tache.status === 'completed'"
                [class.plan__tache--en-cours]="tache.status === 'in_progress'">
              @switch (tache.status) {
                @case ('completed') { <svg lucideCheck class="plan__puce" aria-hidden="true"></svg> }
                @case ('in_progress') { <span class="plan__pastille" aria-hidden="true"></span> }
                @default { <svg lucideCircle class="plan__puce" aria-hidden="true"></svg> }
              }
              <span>{{ tache.content }}</span>
              <span class="plan__sr">{{ libelleEtat(tache.status) }}</span>
            </li>
          }
        </ol>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-block: var(--space-xs);
    }

    .plan {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      overflow: hidden;
    }

    .plan__entete {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: var(--space-xs) var(--space-sm-md);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface-alt);
      color: var(--color-text-muted);

      svg {
        width: 1rem;
        height: 1rem;
      }
    }

    .plan__titre {
      margin: 0;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-text);
    }

    .plan__avancement {
      margin-inline-start: auto;
      font-size: 0.75rem;
      font-variant-numeric: tabular-nums;
    }

    .plan__liste {
      display: flex;
      flex-direction: column;
      gap: var(--space-2xs);
      margin: 0;
      padding: var(--space-xs) var(--space-sm-md);
      list-style: none;
    }

    .plan__tache {
      display: flex;
      align-items: flex-start;
      gap: var(--space-xs);
      font-size: 0.8125rem;
      line-height: 1.45;
      color: var(--color-text);
    }

    .plan__tache--faite {
      color: var(--color-text-muted);
    }

    .plan__puce {
      flex: none;
      width: 0.875rem;
      height: 0.875rem;
      margin-top: 0.15rem;
      color: var(--color-text-muted);
    }

    .plan__tache--faite .plan__puce {
      color: var(--color-success);
    }

    .plan__pastille {
      flex: none;
      width: 0.5rem;
      height: 0.5rem;
      margin: 0.35rem 0.19rem 0;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      animation: plan-pulse 1.2s var(--ease-out) infinite alternate;
    }

    .plan__sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    @keyframes plan-pulse {
      from {
        opacity: 0.35;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .plan__pastille {
        animation: none;
      }
    }
  `
})
export class AssistantPlanComponent implements ToolRenderer<ArgumentsPlan> {
  readonly toolCall = input.required<AngularToolCall<ArgumentsPlan>>();

  readonly taches = computed<readonly TachePlan[]>(() =>
    (this.toolCall().args.todos ?? []).filter((t): t is TachePlan => typeof t?.content === 'string')
  );
  readonly terminees = computed(() => this.taches().filter((t) => t.status === 'completed').length);

  libelleEtat(statut: TachePlan['status']): string {
    return statut === 'completed' ? '(terminée)' : statut === 'in_progress' ? '(en cours)' : '(à faire)';
  }
}
