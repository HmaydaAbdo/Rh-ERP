import { Translation } from 'primeng/api';

/** Textes français des composants PrimeNG (calendrier, filtres, messages d'état) : sans eux, les mois et jours s'affichent en
 * anglais. Appliqués une fois au démarrage (`AppComponent`). */
export const PRIMENG_FR: Translation = {
  firstDayOfWeek: 1,
  dayNames: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  dayNamesShort: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'],
  dayNamesMin: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  monthNames: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  monthNamesShort: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  today: "Aujourd'hui",
  clear: 'Effacer',
  weekHeader: 'Sem.',
  dateFormat: 'dd/mm/yy',
  emptyMessage: 'Aucun résultat',
  emptyFilterMessage: 'Aucun résultat',
  accept: 'Oui',
  reject: 'Non',
  apply: 'Appliquer',
  cancel: 'Annuler',
  choose: 'Choisir',
  upload: 'Téléverser',
  selectionMessage: '{0} éléments sélectionnés',
  noFilter: 'Aucun filtre',
  passwordPrompt: 'Saisissez un mot de passe',
  weak: 'Faible',
  medium: 'Moyen',
  strong: 'Fort'
};
