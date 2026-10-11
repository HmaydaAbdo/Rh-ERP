
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  LucideBriefcase,
  LucideBuilding,
  LucideHistory,
  LucideLogOut,
  LucideMenu,
  LucideMoon,
  LucideNetwork,
  LucideShield,
  LucideSettings,
  LucideSun,
  LucideUserCog,
  LucideUsers,
  LucideWallet,
  LucideX
} from '@lucide/angular';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from './core/auth/services/auth.service';
import { NAV_ITEMS } from './core/navigation/nav-items';
import { ThemeService } from './core/theme/theme.service';
import { FeedbackViewportComponent } from './shared/feedback/feedback-viewport.component';

function estRouteAuthentification(url: string): boolean {
  const chemin = url.split(/[?#]/, 1)[0] ?? '';
  return chemin === '/login' || chemin === '/forgot-password' || chemin === '/reset-password';
}

@Component({
    selector: 'app-root',
    imports: [
      RouterOutlet,
      RouterLink,
      RouterLinkActive,
      FeedbackViewportComponent,
      LucideBriefcase,
      LucideBuilding,
      LucideHistory,
      LucideLogOut,
      LucideMenu,
      LucideMoon,
      LucideNetwork,
      LucideShield,
      LucideSettings,
      LucideSun,
      LucideUserCog,
      LucideUsers,
      LucideWallet,
      LucideX
    ],
    templateUrl: './app.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);

  /** Menu en tiroir (téléphone, tablette tactile) : ouvert par le bouton de la barre du haut, fermé par le fond, Échap ou un choix. */
  readonly menuOuvert = signal(false);

  readonly user = this.authService.user;
  readonly isAuthenticated = this.authService.isAuthenticated;
  readonly estRouteAuthentification = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => estRouteAuthentification(event.urlAfterRedirects)),
      startWith(estRouteAuthentification(this.router.url))
    ),
    { initialValue: estRouteAuthentification(this.router.url) }
  );
  readonly navigationVisible = computed(() => this.isAuthenticated() && !this.estRouteAuthentification());

  readonly navItems = computed(() =>
    NAV_ITEMS.filter((item) => this.authService.hasPermission(item.permission))
  );

  basculerMenu(): void {
    this.menuOuvert.update((ouvert) => !ouvert);
  }

  /** Lien d'évitement : le focus passe au contenu (un `href="#…"` suivrait la balise `<base>` et rechargerait l'accueil). */
  allerAuContenu(evenement: Event): void {
    evenement.preventDefault();
    document.getElementById('contenu')?.focus();
  }

  fermerMenu(): void {
    this.menuOuvert.set(false);
  }

  onLogout(): void {
    this.authService.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
