import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CartesPerimetreComponent } from '../../perimetre/cartes/cartes-perimetre.component';
import { moduleHeuresSupp } from '../heures-supp-module';

@Component({ selector: 'app-heures-supp-cartes', imports: [CartesPerimetreComponent], template: '<app-cartes-perimetre [module]="module" />', changeDetection: ChangeDetectionStrategy.OnPush })
export class HeuresSuppCartesComponent { protected readonly module = moduleHeuresSupp(); }
