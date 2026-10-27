import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from '../auth/services/auth.service';

const CLE = 'erp-rh.assistant.fil';

/**
 * Le fil de discussion de l'assistant pour l'utilisateur connecté : repris après un rechargement de la page (le runtime
 * CopilotKit rejoue son historique, `connect`), remplacé par « Nouvelle conversation ». L'identifiant commence par
 * `u<id>-` : le runtime refuse un fil qui n'appartient pas à l'utilisateur authentifié.
 */
@Injectable()
export class FilAssistant {
  private readonly auth = inject(AuthService);
  private readonly courant = signal<string | null>(null);

  readonly fil = computed(() => {
    const utilisateur = this.auth.user()?.id;
    if (utilisateur === undefined) {
      return undefined;
    }
    const fil = this.courant();
    return fil?.startsWith(`u${utilisateur}-`) ? fil : this.reprendre(utilisateur);
  });

  /** Commence une conversation vide ; l'ancienne reste dans la mémoire de l'agent jusqu'à sa purge. */
  nouveau(): void {
    const utilisateur = this.auth.user()?.id;
    if (utilisateur !== undefined) {
      this.courant.set(this.enregistrer(utilisateur, `u${utilisateur}-${crypto.randomUUID()}`));
    }
  }

  private reprendre(utilisateur: number): string {
    let fil: string | null = null;
    try {
      fil = localStorage.getItem(`${CLE}.${utilisateur}`);
    } catch {
      // Stockage indisponible (navigation privée) : une conversation neuve à chaque chargement.
    }
    return fil?.startsWith(`u${utilisateur}-`) ? fil : this.enregistrer(utilisateur, `u${utilisateur}-${crypto.randomUUID()}`);
  }

  private enregistrer(utilisateur: number, fil: string): string {
    try {
      localStorage.setItem(`${CLE}.${utilisateur}`, fil);
    } catch {
      // Sans stockage, le fil vaut pour cette page seulement.
    }
    return fil;
  }
}
