import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { LucideArrowLeft, LucideArrowUpRight, LucideChevronDown, LucideShieldCheck, LucideTriangleAlert } from '@lucide/angular';

import type { Echange } from './assistant.service';

/**
 * Un échange de la discussion, à la manière d'un chat d'assistant : la question, un bloc repliable d'étapes et d'outils
 * (déplié tant que l'agent travaille), la réponse vérifiée et son chiffre principal, puis la vue ouverte et le retour.
 */
@Component({
  selector: 'app-assistant-echange',
  imports: [LucideArrowLeft, LucideArrowUpRight, LucideChevronDown, LucideShieldCheck, LucideTriangleAlert],
  templateUrl: './assistant-echange.component.html',
  styleUrl: './assistant-echange.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssistantEchangeComponent {
  readonly echange = input.required<Echange>();
  readonly revenir = output<void>();
  readonly rouvrir = output<void>();

  private readonly ouvertes = signal(false);
  readonly enCours = computed(() => this.echange().etat === 'encours');
  readonly etapesVisibles = computed(() => this.enCours() || this.ouvertes());
  readonly resume = computed(() => {
    const echange = this.echange();
    if (this.enCours()) {
      return echange.etapes.at(-1)?.libelle ?? 'Démarrage…';
    }
    const outils = echange.outils.length;
    return `${echange.etapes.length} étapes · ${outils} ${outils > 1 ? 'outils' : 'outil'}`;
  });
  readonly chiffrePrincipal = computed(() => {
    const valeur = this.echange().chiffres[0];
    if (valeur === undefined) {
      return null;
    }
    const nombre = Number(valeur);
    return Number.isFinite(nombre) ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(nombre) : valeur;
  });

  basculerEtapes(): void {
    this.ouvertes.update((ouvertes) => !ouvertes);
  }
}
