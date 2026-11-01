import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

/** Un indicateur que l'utilisateur peut afficher (catalogue fixe du backend, filtré par ses permissions). */
export interface IndicateurDisponible {
  code: string;
  libelle: string;
  description: string;
}

/** L'accueil d'un utilisateur : `version` est absente (`null`) tant que rien n'a été choisi. */
export interface Accueil {
  version: number | null;
  personnalise: boolean;
  indicateurs: string[];
  disponibles: IndicateurDisponible[];
}

export interface AccueilUpdateRequest {
  version: number | null;
  indicateurs: string[];
}

@Injectable({ providedIn: 'root' })
export class AccueilService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'accueil';

  lire(): Observable<Accueil> {
    return this.http.get<Accueil>(this.baseUrl);
  }

  enregistrer(request: AccueilUpdateRequest): Observable<Accueil> {
    return this.http.put<Accueil>(this.baseUrl, request);
  }

  reinitialiser(): Observable<Accueil> {
    return this.http.delete<Accueil>(this.baseUrl);
  }

  lireDe(utilisateurId: number): Observable<Accueil> {
    return this.http.get<Accueil>(`${this.baseUrl}/utilisateurs/${utilisateurId}`);
  }

  enregistrerDe(utilisateurId: number, request: AccueilUpdateRequest): Observable<Accueil> {
    return this.http.put<Accueil>(`${this.baseUrl}/utilisateurs/${utilisateurId}`, request);
  }

  reinitialiserDe(utilisateurId: number): Observable<Accueil> {
    return this.http.delete<Accueil>(`${this.baseUrl}/utilisateurs/${utilisateurId}`);
  }
}
