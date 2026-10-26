import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { HttpAgent, type AgentSubscriber, type BaseEvent } from '@ag-ui/client';
import { filter, firstValueFrom, take, timeout } from 'rxjs';

import { AuthService } from '../auth/services/auth.service';
import { chiffresCites, surlignerChiffres } from './chiffres';
import { cibleDeVue, type CibleVue } from './vue-assistant';

/**
 * Assistant RH (docs/ia.md, T8) : conversation avec l'agent du service IA par AG-UI (`@ag-ui/client`, point d'entrée
 * `/ia/agui`, relayé par nginx en production et par `proxy.conf.js` en développement).
 *
 * Quand la réponse vérifiée s'appuie sur une vue, l'assistant **ouvre lui-même** cette vue, filtres appliqués : route connue
 * seulement (liste blanche de `vue-assistant.ts`), gardes de route respectées (droits, saisie non enregistrée), retour possible
 * à l'écran précédent. Ouvrir une vue ne déclenche aucune action métier.
 *
 * Le service IA ne garde pas d'historique (J1) : chaque question est traitée seule ; le fil reste affiché ici.
 */

export type EtatEchange = 'encours' | 'reponse' | 'abstention' | 'erreur' | 'arrete';
export type Humeur = 'neutral' | 'attentive' | 'thinking' | 'searching' | 'found' | 'asking' | 'apologetic';

export interface EtapeAffichee {
  readonly nom: string;
  readonly libelle: string;
  readonly terminee: boolean;
}

export interface OuvertureVue {
  readonly cible: CibleVue;
  /** `ouverte` : la vue est affichée ; `refusee` : une garde de route a refusé (droit, saisie en cours). */
  readonly statut: 'ouverte' | 'refusee';
  readonly urlPrecedente: string;
}

export interface Echange {
  readonly id: string;
  readonly question: string;
  readonly etat: EtatEchange;
  readonly etapes: readonly EtapeAffichee[];
  readonly outils: readonly string[];
  readonly texte: string;
  readonly chiffres: readonly string[];
  readonly motif: string | null;
  readonly ouverture: OuvertureVue | null;
}

/** Ce que le service attend d'un agent AG-UI ; remplaçable dans les tests. */
export interface AgentIa {
  runAgent(parametres: { runId: string }, abonne: AgentSubscriber): Promise<unknown>;
  abortRun(): void;
}

export type FabriqueAgentIa = (config: { threadId: string; jeton: string; question: string; idMessage: string }) => AgentIa;

export const FABRIQUE_AGENT_IA = new InjectionToken<FabriqueAgentIa>('FABRIQUE_AGENT_IA', {
  providedIn: 'root',
  factory: () => (config) => {
    const agent = new HttpAgent({
      url: '/ia/agui',
      threadId: config.threadId,
      headers: { Authorization: `Bearer ${config.jeton}` }
    });
    agent.messages = [{ id: config.idMessage, role: 'user', content: config.question }];
    return agent;
  }
});

const LIBELLES_ETAPES: Readonly<Record<string, string>> = {
  trier: 'Lire le message',
  preparer: 'Comprendre la question',
  cibler: 'Choisir les domaines',
  choisir: 'Choisir les données',
  executer: 'Lire les données',
  rediger: 'Rédiger la réponse',
  verifier: 'Vérifier chaque chiffre',
  conclure: 'Préparer la réponse'
};

const HUMEURS: readonly Humeur[] = ['neutral', 'attentive', 'thinking', 'searching', 'found', 'asking', 'apologetic'];
const TAILLE_QUESTION = 2000;

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fabrique = inject(FABRIQUE_AGENT_IA);

  private readonly fil = signal<readonly Echange[]>([]);
  private readonly humeurCourante = signal<Humeur>('neutral');
  private threadId = nouvelId();
  private agentCourant: AgentIa | null = null;
  private runCourant: string | null = null;
  private retirerSurlignage: (() => void) | null = null;

  readonly echanges = this.fil.asReadonly();
  readonly humeur = this.humeurCourante.asReadonly();
  readonly enCours = computed(() => this.fil().at(-1)?.etat === 'encours');
  readonly disponible = computed(() => this.auth.hasPermission('IA_UTILISER'));

  async demander(question: string): Promise<void> {
    const texte = question.trim();
    if (!texte || texte.length > TAILLE_QUESTION || this.enCours()) {
      return;
    }
    const id = nouvelId();
    this.runCourant = id;
    this.fil.update((fil) => [
      ...fil,
      { id, question: texte, etat: 'encours', etapes: [], outils: [], texte: '', chiffres: [], motif: null, ouverture: null }
    ]);
    this.humeurCourante.set('thinking');
    try {
      await this.executer(id, texte, true);
    } catch {
      if (this.runCourant !== id) {
        return; // arrêté entre-temps
      }
      this.runCourant = null;
      this.terminer(id, { etat: 'erreur', texte: 'L’assistant est momentanément indisponible. Réessayez ou ouvrez l’écran classique.' });
    }
  }

  /** Arrêt immédiat côté écran, puis coupure de la connexion : les événements tardifs du run sont ignorés. */
  arreter(): void {
    const id = this.runCourant;
    if (!id || !this.enCours()) {
      return;
    }
    this.runCourant = null;
    this.agentCourant?.abortRun();
    this.terminer(id, { etat: 'arrete' });
  }

  /** Retour à l'écran affiché avant que l'assistant n'ouvre une vue. */
  async revenir(echange: Echange): Promise<void> {
    if (echange.ouverture?.statut === 'ouverte') {
      this.retirerSurlignage?.();
      await this.router.navigateByUrl(echange.ouverture.urlPrecedente);
    }
  }

  /** Nouvel essai d'ouverture, par exemple après avoir enregistré la saisie qui bloquait la navigation. */
  async rouvrir(echange: Echange): Promise<void> {
    if (echange.ouverture) {
      await this.ouvrir(echange.id, echange.ouverture.cible, echange.chiffres);
    }
  }

  nouvelleDiscussion(): void {
    this.arreter();
    this.retirerSurlignage?.();
    this.fil.set([]);
    this.threadId = nouvelId();
    this.humeurCourante.set('neutral');
  }

  private async executer(id: string, question: string, nouvelEssai: boolean): Promise<void> {
    const jeton = this.auth.getAccessToken() ?? '';
    const agent = this.fabrique({ threadId: this.threadId, jeton, question, idMessage: nouvelId() });
    this.agentCourant = agent;
    let vue: unknown = null;
    let abstention = false;
    let motif: string | null = null;
    let demarre = false;
    let echec = false;
    const actif = () => this.runCourant === id;
    try {
      await agent.runAgent(
        { runId: id },
        {
          onEvent: ({ event }) => {
            if (!actif()) {
              return;
            }
            demarre = true;
            const e = event as BaseEvent & Record<string, unknown>;
            switch (e.type) {
              case 'STEP_STARTED':
                this.etape(id, String(e['stepName']));
                break;
              case 'TOOL_CALL_START':
                this.modifier(id, (x) => ({ outils: [...x.outils, String(e['toolCallName'])] }));
                break;
              case 'TEXT_MESSAGE_CONTENT':
                this.modifier(id, (x) => ({ texte: x.texte + String(e['delta'] ?? '') }));
                break;
              case 'CUSTOM': {
                const valeur = e['value'] as Record<string, unknown> | undefined;
                if (e['name'] === 'com.staport.mascot.state.v1') {
                  const humeur = valeur?.['mood'];
                  this.humeurCourante.set(HUMEURS.includes(humeur as Humeur) ? (humeur as Humeur) : 'neutral');
                } else if (e['name'] === 'com.staport.answer.v1') {
                  abstention = valeur?.['abstention'] === true;
                  motif = typeof valeur?.['motif'] === 'string' ? (valeur['motif'] as string) : null;
                  vue = valeur?.['vue'] ?? null;
                }
                break;
              }
              case 'RUN_ERROR':
                echec = true; // le client avale les exceptions d'un abonné : on note, on traite après le run
                break;
            }
          }
        }
      );
    } catch (erreur) {
      if (!actif()) {
        return; // run arrêté par l'utilisateur
      }
      if (!demarre && nouvelEssai && (erreur as { status?: number }).status === 401) {
        await firstValueFrom(this.auth.refreshOnce());
        return this.executer(id, question, false);
      }
      throw erreur;
    } finally {
      if (this.agentCourant === agent) {
        this.agentCourant = null;
      }
    }
    if (!actif()) {
      return;
    }
    if (echec) {
      throw new Error('RUN_ERROR');
    }
    this.runCourant = null;
    const texte = this.fil().find((x) => x.id === id)?.texte ?? '';
    const chiffres = abstention ? [] : chiffresCites(texte);
    this.terminer(id, { etat: abstention ? 'abstention' : 'reponse', motif, chiffres });
    const cible = abstention ? null : cibleDeVue(vue);
    if (cible) {
      await this.ouvrir(id, cible, chiffres);
    }
  }

  private async ouvrir(id: string, cible: CibleVue, chiffres: readonly string[]): Promise<void> {
    const urlPrecedente = this.router.url;
    this.retirerSurlignage?.();
    const fin = firstValueFrom(
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd), take(1), timeout(10000))
    ).catch(() => null);
    const ouverte = await this.router.navigate([...cible.commandes], { queryParams: { ...cible.queryParams } });
    this.modifier(id, () => ({ ouverture: { cible, statut: ouverte ? 'ouverte' : 'refusee', urlPrecedente } }));
    if (ouverte) {
      await fin;
      const racine = document.getElementById('contenu');
      if (racine) {
        this.retirerSurlignage = surlignerChiffres(racine, chiffres);
      }
    }
  }

  private etape(id: string, nom: string): void {
    const libelle = LIBELLES_ETAPES[nom] ?? nom;
    this.modifier(id, (x) => {
      const etapes = x.etapes.map((e) => ({ ...e, terminee: true }));
      const sansDoublon = etapes.filter((e) => e.nom !== nom);
      return { etapes: [...sansDoublon, { nom, libelle, terminee: false }] };
    });
  }

  private terminer(id: string, changement: Partial<Echange>): void {
    this.modifier(id, (x) => ({ ...changement, etapes: x.etapes.map((e) => ({ ...e, terminee: true })) }));
    const etat = changement.etat;
    this.humeurCourante.set(etat === 'reponse' ? 'found' : etat === 'arrete' ? 'neutral' : 'apologetic');
  }

  private modifier(id: string, changement: (echange: Echange) => Partial<Echange>): void {
    this.fil.update((fil) => fil.map((x) => (x.id === id ? { ...x, ...changement(x) } : x)));
  }
}

function nouvelId(): string {
  return crypto.randomUUID();
}
