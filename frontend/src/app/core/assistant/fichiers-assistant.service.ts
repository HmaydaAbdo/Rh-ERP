import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { telechargerFichier } from '../../shared/utils/telecharger-fichier';

/** Les fichiers de l'espace de l'utilisateur écrits par l'agent : téléchargement avec son jeton de connexion. */
@Injectable({ providedIn: 'root' })
export class FichiersAssistant {
  private readonly http = inject(HttpClient);

  /** Le classeur de paie préparé par l'assistant : la référence (5 minutes) n'est valable que pour l'utilisateur connecté. */
  async telechargerExport(reference: string, nom: string): Promise<void> {
    const blob = await firstValueFrom(
      this.http.get(`paie/export/agent/${encodeURIComponent(reference)}`, { responseType: 'blob' })
    );
    telechargerFichier(blob, nom);
  }

  /** `chemin` est celui de l'agent (`/espace/rapport.md`) ; le service IA ne rend que les fichiers de cet utilisateur. */
  async telecharger(chemin: string): Promise<void> {
    const sur = chemin.replace(/^\/+/, '');
    const blob = await firstValueFrom(this.http.get(`ia/fichiers/${sur}`, { responseType: 'blob' }));
    telechargerFichier(blob, sur.split('/').pop() || 'fichier');
  }
}
