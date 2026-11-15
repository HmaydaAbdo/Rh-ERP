import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const URL_MEMOIRE = 'ia/memoire';

/** Taille maximale de la mémoire (caractères), la même que celle du service IA (`TAILLE_MAX_MEMOIRE`). */
export const TAILLE_MAX_MEMOIRE = 4000;

/**
 * Ce que l'assistant retient de l'utilisateur d'une conversation à l'autre (KAN-84) : consultation, correction et
 * oubli directs. L'assistant n'y écrit qu'avec l'accord de l'utilisateur (carte d'accord d'écriture) ; l'identité
 * vient du jeton de connexion, jamais du navigateur.
 */
@Injectable({ providedIn: 'root' })
export class MemoireAssistant {
  private readonly http = inject(HttpClient);
  readonly contenu = signal('');
  readonly modifie = signal<string | null>(null);

  async charger(): Promise<void> {
    try {
      const memoire = await firstValueFrom(this.http.get<{ contenu: string; modifie: string | null }>(URL_MEMOIRE));
      this.contenu.set(memoire.contenu);
      this.modifie.set(memoire.modifie);
    } catch {
      // Mémoire indisponible : l'assistant reste utilisable, le message d'erreur est celui de l'intercepteur.
    }
  }

  /** Remplace la mémoire par le texte corrigé ; un texte vide revient à tout oublier. */
  async enregistrer(texte: string): Promise<void> {
    await firstValueFrom(this.http.put(URL_MEMOIRE, { contenu: texte }));
    await this.charger();
  }

  async oublier(): Promise<void> {
    await firstValueFrom(this.http.delete(URL_MEMOIRE));
    await this.charger();
  }
}
