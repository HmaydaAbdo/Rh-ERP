import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, maxLength, required, hidden, pattern, validate } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { attendreEnregistrement } from '../../../shared/forms/soumission';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { STATUT_CHANTIER_OPTIONS } from '../models/chantier-statut';
import { ChantierService } from '../services/chantier.service';
import { NatureChantier, NATURE_CHANTIER_OPTIONS } from '../models/chantier.model';


@Component({
  selector: 'app-chantier-form',
  imports: [FormField, FormRoot, RouterLink, ButtonComponent, FieldErrorComponent, IconComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chantier-form.component.html'
})
export class ChantierFormComponent {
  private readonly chantierService = inject(ChantierService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  protected readonly actifOptions = STATUT_CHANTIER_OPTIONS;
  protected readonly natureOptions = NATURE_CHANTIER_OPTIONS;
  protected readonly affichageOptions = [{ label: 'Non', value: false }, { label: 'Oui', value: true }];
  protected readonly localisationOptions = [{ label: 'Lien Google Maps', value: 'LIEN' }, { label: 'Latitude et longitude', value: 'COORDONNEES' }];

  private readonly chantierId = signal<number | null>(null);
  private readonly version = signal<number | null>(null);
  protected readonly isEditMode = computed(() => this.chantierId() !== null);

  private readonly modele = signal({ code: '', designation: '', nom: '', actif: true,
    nature: '' as NatureChantier | '', afficherSurCarte: false, modeLocalisation: 'LIEN', localisation: '', latitude: '', longitude: '' });
  protected readonly form = form(
    this.modele,
    (chemin) => {
      required(chemin.code, { message: 'Le code est obligatoire.' });
      maxLength(chemin.code, 100, { message: 'Le code ne dépasse pas 100 caractères.' });
      required(chemin.designation, { message: 'La désignation est obligatoire.' });
      maxLength(chemin.designation, 500, { message: 'La désignation ne dépasse pas 500 caractères.' });
      maxLength(chemin.nom, 255, { message: 'Le nom ne dépasse pas 255 caractères.' });
      required(chemin.nature, { message: 'La nature du chantier est obligatoire.' });
      hidden(chemin.localisation, ({ valueOf }) => valueOf(chemin.modeLocalisation) !== 'LIEN');
      hidden(chemin.latitude, ({ valueOf }) => valueOf(chemin.modeLocalisation) !== 'COORDONNEES');
      hidden(chemin.longitude, ({ valueOf }) => valueOf(chemin.modeLocalisation) !== 'COORDONNEES');
      required(chemin.localisation, { when: ({ valueOf }) => valueOf(chemin.afficherSurCarte), message: 'La localisation est obligatoire pour afficher le chantier sur la carte.' });
      maxLength(chemin.localisation, 2048, { message: 'Le lien ne dépasse pas 2 048 caractères.' });
      required(chemin.latitude, { when: ({ valueOf }) => valueOf(chemin.afficherSurCarte) || valueOf(chemin.longitude) !== '', message: 'La latitude est obligatoire.' });
      required(chemin.longitude, { when: ({ valueOf }) => valueOf(chemin.afficherSurCarte) || valueOf(chemin.latitude) !== '', message: 'La longitude est obligatoire.' });
      for (const champ of [chemin.latitude, chemin.longitude]) {
        pattern(champ, /^-?\d+(\.\d{1,8})?$/, { message: 'Saisissez un nombre avec un point décimal (8 décimales maximum).' });
      }
      validate(chemin.latitude, ({ value }) => value() !== '' && Math.abs(Number(value())) > 90 ? { kind: 'latitude', message: 'La latitude doit être comprise entre -90 et 90.' } : undefined);
      validate(chemin.longitude, ({ value }) => value() !== '' && Math.abs(Number(value())) > 180 ? { kind: 'longitude', message: 'La longitude doit être comprise entre -180 et 180.' } : undefined);
    },
    { submission: { action: () => this.enregistrer(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.chantierId.set(id);
      this.chantierService.getById(id).subscribe((chantier) => {
        this.version.set(chantier.version);
        this.modele.set({ code: chantier.code, designation: chantier.designation, nom: chantier.nom ?? '', actif: chantier.actif,
          nature: chantier.nature ?? '', afficherSurCarte: chantier.afficherSurCarte,
          modeLocalisation: chantier.localisation ? 'LIEN' : 'COORDONNEES', localisation: chantier.localisation ?? '',
          latitude: chantier.latitude?.toString() ?? '', longitude: chantier.longitude?.toString() ?? '' });
      });
    }
  }

  private async enregistrer(): Promise<void> {
    const saisie = this.modele();
    if (!saisie.nature) { return; }
    const dto = { code: saisie.code, designation: saisie.designation, nom: saisie.nom || null,
      nature: saisie.nature, afficherSurCarte: saisie.afficherSurCarte,
      localisation: saisie.modeLocalisation === 'LIEN' ? saisie.localisation.trim() || null : null,
      latitude: saisie.modeLocalisation === 'COORDONNEES' && saisie.latitude !== '' ? Number(saisie.latitude) : null,
      longitude: saisie.modeLocalisation === 'COORDONNEES' && saisie.longitude !== '' ? Number(saisie.longitude) : null };
    const id = this.chantierId();

    const chantier = await attendreEnregistrement(
      id !== null ? this.chantierService.update(id, { ...dto, actif: saisie.actif, version: this.version()! }) : this.chantierService.create(dto)
    );
    if (!chantier) {
      return;
    }
    this.messageService.add({
      severity: 'success',
      summary: id !== null ? 'Chantier modifié' : 'Chantier créé',
      life: 4000
    });
    this.form().reset();
    this.router.navigate(['/chantiers', chantier.id]);
  }
}
