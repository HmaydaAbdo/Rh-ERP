import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AngularToolCall, ToolRenderer } from '@copilotkit/angular';
import { LucideCheck } from '@lucide/angular';

/** Domaines d'ERP-RH dans le vocabulaire de l'interface, pour nommer l'outil consulté sans montrer son nom technique. */
const DOMAINES: Readonly<Record<string, string>> = {
  paie: 'Paie',
  employes: 'Employés',
  employe: 'Employé',
  chantier: 'Chantiers',
  equipe: 'Équipes',
  fonction: 'Fonctions',
  rapport: 'Rapport de paie',
  parametres: 'Paramètres',
  roles: 'Rôles',
  audit: 'Journal d’audit',
  systeme: 'Droits'
};

/** `paie_mouvements` → « Paie · mouvements ». */
export function libelleOutil(nom: string | undefined): string {
  const [domaine, ...reste] = (nom ?? '').split('_');
  const libelle = DOMAINES[domaine] ?? domaine;
  const detail = reste.join(' ');
  return detail ? `${libelle} · ${detail}` : libelle;
}

/**
 * Une consultation de données de l'agent (outil MCP de Spring), en une ligne : « Consulte Paie · mouvements » pendant
 * l'appel, puis « Paie · mouvements consulté ». Ni arguments ni résultat bruts : ils restent dans le journal d'audit, et
 * l'agent explique lui-même un refus ou une donnée absente dans sa réponse.
 */
@Component({
  selector: 'app-assistant-outil',
  imports: [LucideCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="outil">
      @if (termine()) {
        <svg lucideCheck aria-hidden="true"></svg>
        <span>{{ libelle() }} consulté</span>
      } @else {
        <span class="outil__rotation" aria-hidden="true"></span>
        <span>Consulte {{ libelle() }}</span>
      }
    </p>
  `,
  styles: `
    :host {
      display: block;
    }

    .outil {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      margin: var(--space-2xs) 0;
      padding: var(--space-2xs) var(--space-sm);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface-alt);
      font-size: 0.75rem;
      color: var(--color-text-muted);

      svg {
        width: 0.875rem;
        height: 0.875rem;
        color: var(--color-success);
      }
    }

    .outil__rotation {
      width: 0.75rem;
      height: 0.75rem;
      border: 2px solid var(--color-border-strong);
      border-top-color: var(--color-primary);
      border-radius: var(--radius-pill);
      animation: outil-rotation 0.8s linear infinite;
    }

    @keyframes outil-rotation {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .outil__rotation {
        animation: none;
      }
    }
  `
})
export class AssistantOutilComponent implements ToolRenderer {
  readonly toolCall = input.required<AngularToolCall>();

  readonly libelle = computed(() => libelleOutil(this.toolCall().name));
  readonly termine = computed(() => this.toolCall().status === 'complete');
}
