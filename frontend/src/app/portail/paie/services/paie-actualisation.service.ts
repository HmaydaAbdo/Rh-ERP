import { Injectable, signal } from '@angular/core';

/**
 * Signal d'actualisation de la paie (KAN-309) : un import réussi le lève, et toutes les vues de la paie affichées dans la
 * conversation de l'assistant se rechargent (chiffres et mois de la barre). Les vues de la page classique se rechargent déjà
 * par leur propre en-tête ; ce service ne leur sert pas.
 */
@Injectable({ providedIn: 'root' })
export class PaieActualisationService {
  private readonly _version = signal(0);
  /** Augmente à chaque import réussi ; une vue qui le lit se recharge quand il change. */
  readonly version = this._version.asReadonly();

  signaler(): void {
    this._version.update((version) => version + 1);
  }
}
