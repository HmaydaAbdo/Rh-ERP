import { inject, Injectable, Signal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, convertToParamMap, ParamMap, Params, Router } from '@angular/router';

/** Options d'une modification de l'état d'une vue. */
export interface ModificationEtatVue {
  /** Vrai : l'état remplace l'entrée courante de l'historique du navigateur au lieu d'en empiler une (saisie au clavier). */
  remplacer?: boolean;
}

/**
 * L'état d'une vue de liste (filtres, périmètre, descente dans les cartes, indicateurs choisis) sous forme de paramètres.
 *
 * Les vues ne lisent ni n'écrivent l'URL elles-mêmes : elles passent par cette abstraction (KAN-306, épopée E23). Sur la
 * page classique, `EtatVueUrl` (fournisseur par défaut) garde l'état dans l'URL : lien direct, retour du navigateur et
 * passage d'une vue à l'autre restituent le même affichage. Dans la conversation de l'assistant, chaque vue intégrée fournit
 * son propre `EtatVueLocal` : plusieurs vues y coexistent sans se piétiner, puisqu'il n'y a qu'une seule URL.
 *
 * La modification **fusionne** les paramètres donnés avec ceux qui existent (comme `queryParamsHandling: 'merge'`) : une
 * valeur `null` ou `undefined` retire le paramètre.
 */
@Injectable({ providedIn: 'root', useFactory: () => inject(EtatVueUrl) })
export abstract class EtatVue {
  abstract readonly params: Signal<ParamMap>;
  abstract modifier(parametres: Params, options?: ModificationEtatVue): void;
}

/** État dans l'URL de la page : le comportement historique des vues. */
@Injectable({ providedIn: 'root' })
export class EtatVueUrl extends EtatVue {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  modifier(parametres: Params, options: ModificationEtatVue = {}): void {
    void this.router.navigate([], {
      queryParams: parametres,
      queryParamsHandling: 'merge',
      replaceUrl: options.remplacer ?? false
    });
  }
}

/** État en mémoire, propre à une vue : n'écrit nulle part, ne lit nulle part (vue intégrée dans la conversation). */
export class EtatVueLocal extends EtatVue {
  private readonly courant = signal<ParamMap>(convertToParamMap({}));
  readonly params = this.courant.asReadonly();

  constructor(depart: Params = {}) {
    super();
    this.courant.set(this.fusionner(convertToParamMap({}), depart));
  }

  modifier(parametres: Params): void {
    this.courant.update((actuel) => this.fusionner(actuel, parametres));
  }

  private fusionner(actuel: ParamMap, ajouts: Params): ParamMap {
    const fusion: Record<string, string | string[]> = {};
    for (const cle of actuel.keys) {
      fusion[cle] = actuel.getAll(cle);
    }
    for (const [cle, valeur] of Object.entries(ajouts)) {
      if (valeur === null || valeur === undefined) {
        delete fusion[cle];
      } else {
        fusion[cle] = Array.isArray(valeur) ? valeur.map(String) : String(valeur);
      }
    }
    return convertToParamMap(fusion);
  }
}
