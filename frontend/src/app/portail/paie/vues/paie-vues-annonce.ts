import { PaieFiltres } from '../filtres/paie-filtres';
import { libellePeriode } from '../paie-format';

export type VueId = 'tabulaire' | 'cartes' | 'analytique';

/**
 * La phrase qui explique, sous la barre, ce que devient le contexte quand on change de vue — pour qu'un utilisateur ne se
 * demande jamais pourquoi l'écran n'est plus le même. `null` quand il n'y a rien à expliquer (même famille de vues, ou aucun
 * contexte à traduire).
 */
export function annonceChangementDeVue(de: VueId, vers: VueId, filtres: PaieFiltres): string | null {
  if (de === vers) {
    return null;
  }
  const pluriel = (n: number, mot: string): string => `${n} ${mot}${n > 1 ? 's' : ''}`;

  if (vers === 'cartes') {
    const chantiers = filtres.chantierIds.length;
    const autres = [
      filtres.nomPrenom.trim() ? 'nom' : null,
      filtres.cin.trim() ? 'CIN' : null,
      filtres.fonctionIds.length > 0 ? 'fonctions' : null,
      filtres.equipeIds.length > 0 ? 'équipes' : null
    ].filter((filtre): filtre is string => filtre !== null);
    const reste = autres.length > 0 ? ` Les filtres ${autres.join(', ')} restent actifs (voir « Filtres actifs »).` : '';

    if (!filtres.periode) {
      return `Cartes : niveau mois.${reste}`;
    }
    if (chantiers === 1) {
      return `Cartes : ouvertes directement sur le chantier choisi.${reste}`;
    }
    if (chantiers > 1) {
      return `Cartes : niveau chantiers, limité à vos ${chantiers} chantiers.${reste}`;
    }
    return `Cartes : niveau chantiers de ${libellePeriode(filtres.periode)}.${reste}`;
  }

  if (de === 'cartes') {
    const position = [
      filtres.periode ? libellePeriode(filtres.periode) : null,
      filtres.chantierIds.length > 0 ? pluriel(filtres.chantierIds.length, 'chantier') : null
    ].filter((partie): partie is string => partie !== null);
    return position.length > 0 ? `Votre position dans les cartes devient des filtres : ${position.join(', ')}.` : null;
  }

  return null;
}
