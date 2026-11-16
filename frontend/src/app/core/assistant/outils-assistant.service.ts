import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface TitreOutil {
  name: string;
  title: string;
  domain: string;
}

/**
 * Les titres français et les domaines des outils que l'utilisateur peut appeler (KAN-87). Source unique : le serveur
 * MCP, par le service IA ; la liste suit les droits de l'utilisateur et se charge une seule fois par session.
 */
@Injectable({ providedIn: 'root' })
export class OutilsAssistant {
  private readonly http = inject(HttpClient);
  readonly titres = signal<Readonly<Record<string, TitreOutil>>>({});
  private demande: Promise<void> | null = null;

  /** Charge la liste une fois ; une panne laisse le repli générique (jamais le nom technique). */
  charger(): Promise<void> {
    this.demande ??= firstValueFrom(this.http.get<TitreOutil[]>('ia/outils'))
      .then((liste) => this.titres.set(Object.fromEntries(liste.map((o) => [o.name, o]))))
      .catch(() => {
        this.demande = null; // la prochaine carte réessaiera
      });
    return this.demande;
  }
}
