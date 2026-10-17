import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, map, of, shareReplay, tap } from 'rxjs';

import { LazySelectPage, LazySelectSource } from '../../../shared/components/lazy-select/lazy-select.model';
import { PermissionSummary, Role } from '../models/admin.model';
import { RoleService } from './role.service';

/** Source paginée du sélecteur de rôles des comptes. Les rôles connus restent limités aux pages
 * consultées et aux identifiants sélectionnés, car leurs permissions servent au formulaire. */
@Injectable()
export class RoleReferenceService implements LazySelectSource<Role> {
  private readonly roleService = inject(RoleService);
  private readonly cache = new Map<number, Role>();
  private readonly requetesParId = new Map<number, Observable<Role>>();
  private readonly rolesConnusState = signal<ReadonlyMap<number, Role>>(new Map());
  readonly rolesConnus = this.rolesConnusState.asReadonly();

  /** Catalogue complet utilisé par l'édition d'un utilisateur, y compris les permissions absentes de ses rôles. */
  findAllPermissions(): Observable<PermissionSummary[]> {
    return this.roleService.findAllPermissions();
  }

  fetchPage(page: number, size: number, search: string): Observable<LazySelectPage<Role>> {
    return this.roleService.search({ nom: search || undefined }, { page, size, sort: 'nom,asc' }).pipe(
      map((result) => ({ items: result.content, totalRecords: result.page.totalElements })),
      tap((result) => this.ajouter(result.items))
    );
  }

  fetchById(id: number | string): Observable<Role> {
    const roleId = Number(id);
    const connu = this.cache.get(roleId);
    if (connu) {
      return of(connu);
    }

    const requete = this.requetesParId.get(roleId);
    if (requete) {
      return requete;
    }

    const chargement = this.roleService.findById(roleId).pipe(
      tap((role) => this.ajouter([role])),
      finalize(() => this.requetesParId.delete(roleId)),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.requetesParId.set(roleId, chargement);
    return chargement;
  }

  private ajouter(roles: Role[]): void {
    for (const role of roles) {
      this.cache.set(role.id, role);
    }
    this.rolesConnusState.set(new Map(this.cache));
  }
}
