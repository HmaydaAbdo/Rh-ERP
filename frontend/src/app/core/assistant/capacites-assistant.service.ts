import { Injectable, computed, signal } from '@angular/core';
import { injectCapabilities, type AttachmentsConfig } from '@copilotkit/angular';

/** Fichiers que la discussion propose d'ajouter ; le service IA revérifie types, nombre et tailles (il fait foi). */
export const PIECES_JOINTES = {
  accept: 'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv',
  maxSize: 10 * 1024 * 1024
} as const;

/**
 * Ce que le service IA accepte (KAN-93, KAN-270) : la discussion n'affiche le bouton « Ajouter un fichier » que si l'agent
 * déclare accepter les fichiers (capacités AG-UI du runtime, `/info`, lues avec `injectCapabilities`), c'est-à-dire si les pièces
 * jointes sont activées côté serveur (`IA_PIECES_JOINTES`, antivirus joignable). La dictée vocale, elle, est annoncée par le
 * runtime CopilotKit (`audioFileTranscriptionEnabled`) : le micro n'apparaît que si le service de transcription est configuré.
 */
@Injectable({ providedIn: 'root' })
export class CapacitesAssistant {
  private readonly capacites = injectCapabilities('default');
  readonly erreurPiece = signal<string | null>(null);

  /** Configuration officielle `attachments` de `copilot-chat`. */
  readonly pieces = computed<AttachmentsConfig>(() => ({
    enabled: this.capacites()?.multimodal?.input?.file === true,
    ...PIECES_JOINTES,
    onUploadFailed: (erreur) => this.erreurPiece.set(messagePiece(erreur.reason))
  }));
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
