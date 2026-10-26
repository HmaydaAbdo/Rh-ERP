import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom, take, timeout } from 'rxjs';

import { chiffresCites, surlignerChiffres } from './chiffres';
import { cibleDeVue, type CibleVue } from './vue-assistant';

export interface OuvertureVue {
  readonly cible: CibleVue;
  /** `ouverte` : la vue est affichée ; `refusee` : une garde de route a refusé (droit, saisie en cours). */
  readonly statut: 'ouverte' | 'refusee';
  readonly urlPrecedente: string;
  readonly chiffres: readonly string[];
}

/**
 * Ouverture de la vue de la réponse (docs/ia.md, § 6) : quand l'agent a vérifié sa réponse et que l'outil consulté propose
 * une vue, l'assistant l'ouvre lui-même, filtres appliqués. Route connue seulement (liste blanche de `vue-assistant.ts`),
 * gardes de route respectées (droits, saisie non enregistrée), retour possible à l'écran précédent, valeurs citées
 * surlignées dans la vue. Ouvrir une vue ne déclenche aucune action métier.
 */
@Injectable({ providedIn: 'root' })
export class OuvertureVueService {
  private readonly router = inject(Router);
  private retirerSurlignage: (() => void) | null = null;

  private readonly courante = signal<OuvertureVue | null>(null);
  readonly ouverture = this.courante.asReadonly();

  /** Ouvre la vue proposée ; une description inconnue ou mal formée est ignorée, sans message ni effet. */
  async ouvrir(vue: unknown, texteReponse: string): Promise<void> {
    const cible = cibleDeVue(vue);
    if (!cible) {
      this.oublier();
      return;
    }
    await this.naviguer(cible, chiffresCites(texteReponse));
  }

  /** Retour à l'écran affiché avant l'ouverture. */
  async revenir(): Promise<void> {
    const ouverture = this.courante();
    if (ouverture?.statut === 'ouverte') {
      this.retirerSurlignage?.();
      this.courante.set(null);
      await this.router.navigateByUrl(ouverture.urlPrecedente);
    }
  }

  /** Nouvel essai, par exemple après avoir enregistré la saisie qui bloquait la navigation. */
  async rouvrir(): Promise<void> {
    const ouverture = this.courante();
    if (ouverture) {
      await this.naviguer(ouverture.cible, ouverture.chiffres, ouverture.urlPrecedente);
    }
  }

  oublier(): void {
    this.retirerSurlignage?.();
    this.retirerSurlignage = null;
    this.courante.set(null);
  }

  private async naviguer(cible: CibleVue, chiffres: readonly string[], urlPrecedente = this.router.url): Promise<void> {
    this.retirerSurlignage?.();
    const fin = firstValueFrom(
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd), take(1), timeout(10000))
    ).catch(() => null);
    const ouverte = await this.router.navigate([...cible.commandes], { queryParams: { ...cible.queryParams } });
    this.courante.set({ cible, statut: ouverte ? 'ouverte' : 'refusee', urlPrecedente, chiffres });
    if (ouverte) {
      await fin;
      const racine = document.getElementById('contenu');
      if (racine) {
        this.retirerSurlignage = surlignerChiffres(racine, chiffres);
      }
    }
  }
}
