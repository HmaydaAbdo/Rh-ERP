import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

/** Destination de la navigation : l'icône est le nom d'une icône de `stp-icon`. `groupe` rattache l'entrée à un groupe repliable. */
export interface ShellNavItem {
  readonly label: string;
  readonly icon: string;
  readonly route: string;
  /** Route ouverte par un clic quand elle diffère de `route` (la vue d'ouverture) ; `route` sert à repérer l'écran actif. */
  readonly ouverture?: string;
  readonly groupe?: string;
}

/** Groupe repliable de la navigation (placé à l'endroit de sa première entrée). */
export interface ShellNavGroupe {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

/** Une commande de la barre Staport, traitée par la coque de l'application. */
export type DockCommande = 'accueil' | 'assistant-ouvrir' | 'assistant-fermer' | 'theme' | 'deconnexion';

/**
 * État partagé de la navigation unifiée : la barre Staport (ouverte par le bouton hamburger de l'en-tête de chaque page) porte les
 * commandes et les destinations. La coque (`stp-app-shell`) renseigne ce qu'elle montre depuis ses entrées ; les commandes
 * repartent vers elle par `commandes` : le déclencheur et la barre ne connaissent ni le thème, ni l'assistant, ni la session.
 */
@Injectable({ providedIn: 'root' })
export class DockEtatService {
  readonly ouvert = signal(false);
  readonly items = signal<readonly ShellNavItem[]>([]);
  readonly groupes = signal<readonly ShellNavGroupe[]>([]);
  readonly utilisateur = signal<string | null>(null);
  readonly assistantDisponible = signal(false);
  readonly assistantOuvert = signal(false);
  readonly theme = signal<'light' | 'dark'>('dark');
  /** Faux : l'Accueil est affiché mais indisponible (en attente de la définition des fiches de poste, plan E9.8). */
  readonly accueilActif = signal(false);

  private readonly flux = new Subject<DockCommande>();
  readonly commandes = this.flux.asObservable();

  basculer(): void {
    this.ouvert.update((ouvert) => !ouvert);
  }

  fermer(): void {
    this.ouvert.set(false);
  }

  envoyer(commande: DockCommande): void {
    this.flux.next(commande);
  }
}
