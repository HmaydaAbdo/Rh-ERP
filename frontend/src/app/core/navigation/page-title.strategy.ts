import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Titre de l'onglet du navigateur : « Employés · Staport RH ». Chaque section déclare `title` dans ses routes (le titre le plus
 * profond l'emporte) ; sans titre, l'onglet s'appelle simplement « Staport RH ». Utile pour l'historique du navigateur, les
 * onglets multiples et les lecteurs d'écran, qui annoncent le titre à chaque changement d'écran. */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const titre = this.buildTitle(snapshot);
    this.title.setTitle(titre ? `${titre} · Staport RH` : 'Staport RH');
  }
}
