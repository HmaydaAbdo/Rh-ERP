import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import {
  CopilotA2UIActivityRenderer,
  CopilotA2UIProgress,
  readA2UILifecycleContent,
  type ActivityRenderer
} from '@copilotkit/angular';

import { MessageComponent } from '../../shared/ui/message/message.component';

/** Délai et nombre d'essais avant d'annoncer une nouvelle tentative (mêmes valeurs que `a2ui.recovery`, assistant-racine). */
export const REPRISE_APRES_MS = 2000;
export const REPRISE_APRES_ESSAIS = 2;

/**
 * Rendu de l'activité A2UI en français (KAN-96, décision du propriétaire du 2026-11-16).
 *
 * Le composant de la bibliothèque affiche trois messages anglais pendant la construction, la reprise et l'échec d'une
 * surface, et ne les rend pas personnalisables. Ce rendu prend leur place par le point d'extension officiel
 * (`renderActivityMessages`, type d'activité `a2ui-surface`) : tant qu'il n'y a pas de surface, il affiche l'état de la
 * construction en français (états lus par `readA2UILifecycleContent`) ; dès que la surface existe, il rend le composant
 * officiel, dont la signalisation interne anglaise, qui ne dure que le temps du premier affichage, est masquée.
 * Retirer ce composant quand la bibliothèque rendra ces libellés configurables.
 */
@Component({
  selector: 'app-surface-a2ui-francais',
  imports: [CopilotA2UIActivityRenderer, CopilotA2UIProgress, MessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (avecSurface()) {
      <copilot-a2ui-activity-renderer [activityType]="activityType()" [content]="content()" [message]="message()" [agent]="agent()" />
    } @else if (etat().status === 'failed') {
      <stp-message severity="warn" class="my-3 block max-w-lg" text="Impossible de générer cet affichage. Vous pouvez continuer la conversation et réessayer." />
    } @else {
      <copilot-a2ui-progress [phase]="phase()" [tokens]="etat().progressTokens ?? 0" [label]="libelle()" />
    }
  `
})
export class SurfaceA2uiFrancaisComponent implements ActivityRenderer {
  readonly activityType = input.required<string>();
  readonly content = input.required<unknown>();
  readonly message = input.required<ReturnType<ActivityRenderer['message']>>();
  readonly agent = input<ReturnType<ActivityRenderer['agent']>>();

  protected readonly etat = computed(() => readA2UILifecycleContent(this.content()));
  protected readonly avecSurface = computed(() => operations(this.content()).length > 0);
  private readonly reprisRevelee = signal(false);

  protected readonly libelle = computed(() => {
    const { status, attempt, maxAttempts } = this.etat();
    if (status !== 'retrying' || !this.reprisRevelee()) {
      return "Construction de l'affichage";
    }
    return attempt !== undefined && maxAttempts !== undefined
      ? `Nouvelle tentative… (essai ${attempt} sur ${maxAttempts})`
      : 'Nouvelle tentative…';
  });

  protected readonly phase = computed<0 | 1 | 2 | 3>(() => {
    const jetons = this.etat().progressTokens;
    if (jetons === undefined) return 3;
    if (jetons < 50) return 0;
    if (jetons < 200) return 1;
    if (jetons < 400) return 2;
    return 3;
  });

  constructor() {
    // Une reprise n'est annoncée qu'après un délai ou un nombre d'essais, pour ne pas faire clignoter une pause normale.
    effect((nettoyer) => {
      const { status, attempt } = this.etat();
      if (status !== 'retrying') {
        this.reprisRevelee.set(false);
        return;
      }
      if ((attempt ?? 0) >= REPRISE_APRES_ESSAIS) {
        this.reprisRevelee.set(true);
        return;
      }
      const minuterie = setTimeout(() => this.reprisRevelee.set(true), REPRISE_APRES_MS);
      nettoyer(() => clearTimeout(minuterie));
    });
  }
}

/** Les opérations A2UI d'une activité (clé `a2ui_operations`, ou `operations`) : il y en a dès que la surface existe. */
export function operations(contenu: unknown): Record<string, unknown>[] {
  if (!contenu || typeof contenu !== 'object' || Array.isArray(contenu)) return [];
  const brut = (contenu as Record<string, unknown>)['a2ui_operations'] ?? (contenu as Record<string, unknown>)['operations'];
  return Array.isArray(brut) ? brut.filter((o): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o)) : [];
}
