import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { v4 as uuid } from 'uuid';

import { AuthService } from '../auth/services/auth.service';

const CLE = 'staport.assistant.fil';
const CLE_UTILISE = 'staport.assistant.fil-utilise';
const URL_CONVERSATIONS = 'ia/copilotkit/conversations';

/** Adresse de l'espace Staport Intelligence (route de `app.routes.ts`). */
export const ROUTE_ESPACE_ASSISTANT = '/assistant';

/** Une conversation de la liste : le titre est le début de la première question, ou le nom donné par l'utilisateur. */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Le fil de discussion de l'assistant pour l'utilisateur connecté : repris après un rechargement de la page (le runtime
 * CopilotKit rejoue son historique, `connect`), remplacé par « Nouvelle conversation ». L'identifiant commence par
 * `u<id>-` : le runtime refuse un fil qui n'appartient pas à l'utilisateur authentifié.
 */
@Injectable({ providedIn: 'root' })
export class FilAssistant {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  /** Les conversations de l'utilisateur, la plus récente en tête (liste tenue par le runtime, KAN-81). */
  readonly conversations = signal<Conversation[]>([]);
  /** Liste des conversations affichée par-dessus la discussion. */
  readonly listeOuverte = signal(false);
  /** Panneau « Ce que l'assistant retient » (mémoire longue, KAN-84), affiché par-dessus la discussion. */
  readonly memoireOuverte = signal(false);
  /** Écran d'où l'utilisateur est parti en ouvrant l'espace (KAN-91) : le « Retour » et le contexte d'écran s'y rapportent. */
  readonly origine = signal<string | null>(null);
  private readonly courant = signal<string | null>(null);

  readonly fil = computed(() => {
    const utilisateur = this.auth.user()?.id;
    if (utilisateur === undefined) {
      return undefined;
    }
    const fil = this.courant();
    return fil?.startsWith(`u${utilisateur}-`) ? fil : this.reprendre(utilisateur);
  });

  /** Ouvre l'espace dédié à l'IA en retenant l'écran courant. */
  ouvrirEspace(): void {
    this.origine.set(this.router.url);
    void this.router.navigateByUrl(ROUTE_ESPACE_ASSISTANT);
  }

  /** Quitte l'espace : retour à l'écran d'origine, ou à l'accueil si l'espace a été ouvert directement. */
  quitter(): void {
    const origine = this.origine();
    this.origine.set(null);
    void this.router.navigateByUrl(origine && !origine.startsWith(ROUTE_ESPACE_ASSISTANT) ? origine : '/');
  }

  /** Commence une conversation vide ; l'ancienne reste dans la liste et dans la mémoire de l'agent. */
  nouveau(): void {
    const utilisateur = this.auth.user()?.id;
    if (utilisateur !== undefined) {
      this.courant.set(this.enregistrer(utilisateur, `u${utilisateur}-${uuid()}`));
      this.listeOuverte.set(false);
    }
  }

  /** Reprend une conversation de la liste : son historique est rejoué (elle est marquée commencée). */
  ouvrir(id: string): void {
    const utilisateur = this.auth.user()?.id;
    if (utilisateur === undefined || !id.startsWith(`u${utilisateur}-`)) {
      return;
    }
    try {
      localStorage.setItem(`${CLE_UTILISE}.${utilisateur}`, id);
    } catch {
      // Sans stockage, l'historique sera rejoué à cette sélection seulement.
    }
    this.courant.set(this.enregistrer(utilisateur, id));
    this.listeOuverte.set(false);
  }

  async rafraichir(): Promise<void> {
    if (!this.auth.user()) {
      return;
    }
    try {
      this.conversations.set(await firstValueFrom(this.http.get<Conversation[]>(URL_CONVERSATIONS)));
    } catch {
      // Liste indisponible : l'assistant reste utilisable, le message d'erreur est celui de l'intercepteur.
    }
  }

  async renommer(id: string, titre: string): Promise<void> {
    await firstValueFrom(this.http.patch(`${URL_CONVERSATIONS}/${encodeURIComponent(id)}`, { title: titre }));
    await this.rafraichir();
  }

  /** Supprime la conversation (liste, historique et mémoire de l'agent) ; si c'était la courante, une neuve la remplace. */
  async supprimer(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${URL_CONVERSATIONS}/${encodeURIComponent(id)}`));
    if (this.fil() === id) {
      this.nouveau();
    }
    await this.rafraichir();
  }

  /** Le fil a-t-il déjà reçu une question ? Un fil neuf n'a rien à rejouer : l'accueil s'affiche (voir `AssistantChatComponent`). */
  estUtilise(): boolean {
    const utilisateur = this.auth.user()?.id;
    const fil = this.fil();
    if (utilisateur === undefined || fil === undefined) {
      return false;
    }
    try {
      return localStorage.getItem(`${CLE_UTILISE}.${utilisateur}`) === fil;
    } catch {
      return false;
    }
  }

  /** Enregistre que la conversation courante a commencé : elle sera reprise (historique rejoué) au rechargement. */
  marquerUtilise(): void {
    const utilisateur = this.auth.user()?.id;
    const fil = this.fil();
    if (utilisateur === undefined || fil === undefined) {
      return;
    }
    try {
      localStorage.setItem(`${CLE_UTILISE}.${utilisateur}`, fil);
    } catch {
      // Sans stockage, la conversation n'est de toute façon pas reprise après un rechargement.
    }
  }

  private reprendre(utilisateur: number): string {
    let fil: string | null = null;
    try {
      fil = localStorage.getItem(`${CLE}.${utilisateur}`);
    } catch {
      // Stockage indisponible (navigation privée) : une conversation neuve à chaque chargement.
    }
    return fil?.startsWith(`u${utilisateur}-`) ? fil : this.enregistrer(utilisateur, `u${utilisateur}-${uuid()}`);
  }

  private enregistrer(utilisateur: number, fil: string): string {
    try {
      localStorage.setItem(`${CLE}.${utilisateur}`, fil);
    } catch {
      // Sans stockage, le fil vaut pour cette page seulement.
    }
    return fil;
  }
}
