import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { DockEtatService, ShellNavGroupe, ShellNavItem } from '../dock/dock-etat.service';

export type { ShellNavGroupe, ShellNavItem } from '../dock/dock-etat.service';

/**
 * Coque de l'application : toute la largeur au contenu, le lien d'évitement et la zone de contenu. La navigation est unifiée dans
 * la barre Staport (`stp-dock`), que le bouton hamburger de l'en-tête de chaque page ouvre : la coque lui donne ce qu'elle montre
 * (destinations, utilisateur, thème, assistant) et traite ses commandes. Le contenu de l'écran courant est projeté ; la navigation,
 * le thème, le mode de l'assistant et la déconnexion sont pilotés par l'application (entrées et sorties), jamais codés ici.
 *
 *   <stp-app-shell [items]="…" [groupes]="…" [utilisateur]="…" [theme]="…" (basculerTheme)="…" (deconnecter)="…">
 *     <router-outlet />
 *   </stp-app-shell>
 */
@Component({
  selector: 'stp-app-shell',
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppShellComponent {
  private readonly router = inject(Router);
  private readonly dock = inject(DockEtatService);

  readonly items = input<readonly ShellNavItem[]>([]);
  readonly groupes = input<readonly ShellNavGroupe[]>([]);
  readonly utilisateur = input<string | null>(null);
  readonly theme = input<'light' | 'dark'>('light');
  /** Faux sur les écrans publics (connexion…) : seul le contenu est affiché, sans navigation. */
  readonly navigationVisible = input(true);
  /** Staport Intelligence est proposée à cet utilisateur : la barre montre alors le bouton AI. */
  readonly assistantDisponible = input(false);
  readonly assistantOuvert = input(false);
  /** Faux tant que l'Accueil n'est pas proposé : la barre le montre alors indisponible. */
  readonly accueilActif = input(false);

  readonly allerAccueil = output<void>();
  readonly basculerTheme = output<void>();
  /** `true` : ouvrir Staport Intelligence ; `false` : la refermer. */
  readonly modeAssistant = output<boolean>();
  readonly deconnecter = output<void>();

  constructor() {
    // Choisir une destination (ou toute navigation) referme la barre.
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.dock.fermer());

    // La barre montre l'état que la coque lui donne…
    effect(() => {
      this.dock.items.set(this.items());
      this.dock.groupes.set(this.groupes());
      this.dock.utilisateur.set(this.utilisateur());
      this.dock.assistantDisponible.set(this.assistantDisponible());
      this.dock.assistantOuvert.set(this.assistantOuvert());
      this.dock.theme.set(this.theme());
      this.dock.accueilActif.set(this.accueilActif());
    });
    // … et lui renvoie ses commandes.
    this.dock.commandes.pipe(takeUntilDestroyed()).subscribe((commande) => {
      switch (commande) {
        case 'accueil':
          this.allerAccueil.emit();
          break;
        case 'assistant-ouvrir':
          this.modeAssistant.emit(true);
          break;
        case 'assistant-fermer':
          this.modeAssistant.emit(false);
          break;
        case 'theme':
          this.basculerTheme.emit();
          break;
        case 'deconnexion':
          this.deconnecter.emit();
          break;
      }
    });
  }

  /** Lien d'évitement : le focus passe au contenu (un `href="#…"` suivrait la balise `<base>` et rechargerait l'accueil). */
  protected allerAuContenu(evenement: Event): void {
    evenement.preventDefault();
    const lien = evenement.currentTarget as HTMLElement | null;
    lien?.closest('.app-shell')?.querySelector<HTMLElement>('main#contenu')?.focus();
  }
}
