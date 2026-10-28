import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AnalytiquePerimetreComponent } from '../../perimetre/analytique/analytique-perimetre.component';
import { moduleHeuresSupp } from '../heures-supp-module';

@Component({ selector: 'app-heures-supp-analytique', imports: [AnalytiquePerimetreComponent], template: '<app-analytique-perimetre [module]="module" />', changeDetection: ChangeDetectionStrategy.OnPush })
export class HeuresSuppAnalytiqueComponent { protected readonly module = moduleHeuresSupp(); }
