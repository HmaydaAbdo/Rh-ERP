import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from './core/auth/services/auth.service';
import { NAV_ITEMS } from './core/navigation/nav-items';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ToastModule, TooltipModule],
  templateUrl: './app.component.html',
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

  fermerMenu(): void {
    this.menuOuvert.set(false);
  }

  onLogout(): void {
    this.authService.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
