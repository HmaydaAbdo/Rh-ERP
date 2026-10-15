import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';

interface PolitiqueMotDePasse {
  longueurMinimale: number;
}

/**
 * La règle des mots de passe telle que le serveur la fixe : sa longueur minimale est un paramètre réglable par un
 * administrateur (`GET /auth/password-policy`, publique : l'écran de réinitialisation est ouvert sans session). Tant que la
 * réponse n'est pas arrivée, la longueur n'est pas encore vérifiée ; le serveur reste l'autorité et vérifie aussi que le
 * mot de passe est différent de l'identifiant.
 */
@Injectable({ providedIn: 'root' })
export class PolitiqueMotDePasseService {
  private readonly http = inject(HttpClient);
  private readonly longueur = signal<number | null>(null);

  /** Longueur minimale connue, ou `null` avant la réponse du serveur. */
  readonly longueurMinimale = this.longueur.asReadonly();

  /** La règle énoncée aux utilisateurs. */
  readonly regle = computed(() => {
    const longueur = this.longueur();
    return longueur === null
      ? 'La longueur minimale dépend du paramètre administrateur ; le mot de passe doit différer de l’identifiant.'
      : `${longueur} caractères minimum, différent de l’identifiant.`;
  });

  constructor() {
    this.http.get<PolitiqueMotDePasse>('auth/password-policy').subscribe({
      next: (politique) => this.longueur.set(politique.longueurMinimale),
      error: () => undefined
    });
  }
}
