import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { AttachmentsConfig } from '@copilotkit/angular';
import { firstValueFrom } from 'rxjs';

interface Capacites {
  piecesJointes: boolean;
}

/** Fichiers que la discussion propose d'ajouter ; le service IA revérifie types, nombre et tailles (il fait foi). */
export const PIECES_JOINTES = {
  accept: 'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv',
  maxSize: 10 * 1024 * 1024
} as const;

/**
 * Ce que le service IA accepte (KAN-93) : la discussion n'affiche le bouton « Ajouter un fichier » que si les pièces jointes
 * sont activées côté serveur (`IA_PIECES_JOINTES`). La dictée vocale, elle, est annoncée par le runtime CopilotKit
 * (`audioFileTranscriptionEnabled`) : le micro n'apparaît que si le service de transcription est configuré.
 */
@Injectable({ providedIn: 'root' })
export class CapacitesAssistant {
  private readonly http = inject(HttpClient);
  private readonly piecesJointes = signal(false);
  readonly erreurPiece = signal<string | null>(null);

  /** Configuration officielle `attachments` de `copilot-chat`. */
  readonly pieces = computed<AttachmentsConfig>(() => ({
    enabled: this.piecesJointes(),
    ...PIECES_JOINTES,
    onUploadFailed: (erreur) => this.erreurPiece.set(messagePiece(erreur.reason))
  }));

  private demande: Promise<void> | null = null;

  charger(): Promise<void> {
    this.demande ??= firstValueFrom(this.http.get<Capacites>('ia/capacites'))
      .then((capacites) => this.piecesJointes.set(capacites.piecesJointes === true))
      .catch(() => {
        this.demande = null; // une panne laisse les pièces jointes fermées ; on réessaiera
      });
    return this.demande;
  }
}

export function messagePiece(raison: string): string {
  switch (raison) {
    case 'file-too-large':
      return `Ce fichier dépasse ${PIECES_JOINTES.maxSize / (1024 * 1024)} Mo.`;
    case 'invalid-type':
      return 'Ce type de fichier n’est pas accepté (images, PDF, texte, CSV).';
    default:
      return 'Le fichier n’a pas pu être ajouté.';
  }
}
