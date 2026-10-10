
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  LucideBriefcase,
  LucideBuilding,
  LucideHistory,
  LucideLogOut,
  LucideMenu,
  LucideMoon,
  LucideNetwork,
  LucideShield,
  LucideSun,
  LucideUserCog,
  LucideUsers,
  LucideWallet,
  LucideX
} from '@lucide/angular';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from './core/auth/services/auth.service';
import { NAV_ITEMS } from './core/navigation/nav-items';
import { ThemeService } from './core/theme/theme.service';
import { FeedbackViewportComponent } from './shared/feedback/feedback-viewport.component';

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

  title = 'Staport RH';

  /** Menu en tiroir (téléphone, tablette tactile) : ouvert par le bouton de la barre du haut, fermé par le fond, Échap ou un choix. */
  readonly menuOuvert = signal(false);

  readonly user = this.authService.user;
  readonly isAuthenticated = this.authService.isAuthenticated;

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
