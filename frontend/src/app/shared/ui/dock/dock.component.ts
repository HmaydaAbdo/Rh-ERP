import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { IconComponent } from '../icon/icon.component';
import { DockEtatService, ShellNavGroupe, ShellNavItem } from './dock-etat.service';

type EntreeMenu =
  | { readonly type: 'lien'; readonly item: ShellNavItem }
  | { readonly type: 'groupe'; readonly groupe: ShellNavGroupe; readonly enfants: readonly ShellNavItem[] };

/**
 * Navigation unifiée : un seul panneau, ouvert à côté du bouton hamburger de l'en-tête (`stp-dock-declencheur`, overlay du CDK) par
 * une courte animation. En haut les commandes directes (Accueil, AI : Staport Intelligence, thème, fermer), dessous les destinations
 * de l'application — celles que les permissions de l'utilisateur autorisent, les groupes se replient — puis l'utilisateur et sa
 * déconnexion. Se referme avec Échap, un clic à côté, la croix, ou le choix d'une destination.
 */
@Component({
  selector: 'stp-dock',
  imports: [RouterLink, IconComponent],
  templateUrl: './dock.component.html',
  styleUrl: './dock.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DockComponent {
  protected readonly etat = inject(DockEtatService);
  private readonly router = inject(Router);

  private readonly urlCourante = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/, 1)[0] ?? ''),
      startWith(this.router.url.split(/[?#]/, 1)[0] ?? '')
    ),
    { initialValue: this.router.url.split(/[?#]/, 1)[0] ?? '' }
  );
  private readonly groupesChoisis = new Map<string, boolean>();

  protected readonly entrees = computed<readonly EntreeMenu[]>(() => {
    const groupes = this.etat.groupes();
    const resultat: EntreeMenu[] = [];
    for (const item of this.etat.items()) {
      const groupe = groupes.find((g) => g.id === item.groupe);
      if (!groupe) {
        resultat.push({ type: 'lien', item });
      } else if (!resultat.some((e) => e.type === 'groupe' && e.groupe.id === groupe.id)) {
        resultat.push({ type: 'groupe', groupe, enfants: this.etat.items().filter((i) => i.groupe === groupe.id) });
      }
    }
    return resultat;
  });

  protected surAccueil(): void {
    if (this.etat.accueilActif()) {
      this.etat.envoyer('accueil');
    }
  }

  /** L'écran courant est celui de l'entrée (ou l'une de ses vues). */
  protected estActif(item: ShellNavItem): boolean {
    const url = this.urlCourante();
    return url === item.route || url.startsWith(`${item.route}/`);
  }

  /** Un groupe est ouvert quand l'écran courant en fait partie, sauf si l'utilisateur l'a replié ou déplié lui-même depuis. */
  protected groupeOuvert(groupe: ShellNavGroupe, enfants: readonly ShellNavItem[]): boolean {
    return this.groupesChoisis.get(groupe.id) ?? enfants.some((enfant) => this.estActif(enfant));
  }

  protected changerGroupe(groupe: ShellNavGroupe, evenement: Event): void {
    this.groupesChoisis.set(groupe.id, (evenement.currentTarget as HTMLDetailsElement).open);
  }
}
