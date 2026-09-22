import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastModule, TooltipModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Staport RH';

  readonly navItems: NavItem[] = [
    { label: 'Employés', icon: 'pi pi-users', route: '/employees' },
    { label: 'Chantiers', icon: 'pi pi-building', route: '/chantiers' },
    { label: 'Fonctions', icon: 'pi pi-briefcase', route: '/functions' },
    { label: 'Paie', icon: 'pi pi-wallet', route: '/paie' }
  ];
}
