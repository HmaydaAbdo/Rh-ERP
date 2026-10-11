import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface Parametre {
  id: number;
  cle: string;
  libelle: string;
  description: string;
  type: 'ENTIER' | 'CRON';
  unite: string | null;
  minimum: number | null;
  maximum: number | null;
  valeur: string;
}

export interface ParametreUpdateRequest {
  valeur: string;
}

@Injectable({ providedIn: 'root' })
export class ParametreService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'parametres';

  findAll(): Observable<Parametre[]> {
    return this.http.get<Parametre[]>(this.baseUrl);
  }

  update(id: number, request: ParametreUpdateRequest): Observable<Parametre> {
    return this.http.put<Parametre>(`${this.baseUrl}/${id}`, request);
  }
}
