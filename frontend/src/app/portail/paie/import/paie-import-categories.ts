import { PaieImportEcart, PaieImportErreur } from '../models/paie.model';

/**
 * Noms sémantiques des cas rencontrés au contrôle d'un fichier de paie : chaque écart entre le fichier et la fiche d'un
 * employé est rangé selon ce qui a réellement changé (une mutation, un changement d'équipe…), pour se régler cas par cas
 * ou d'un coup. Le rangement suit la priorité : chantier, équipe, fonction, salaire, puis nom.
 */
export interface SousCategorie<T> {
  cle: string;
  libelle: string;
  /** Ce que cela signifie, en une phrase, et ce qu'il y a à décider. */
  consigne: string;
  elements: T[];
}

interface Modele {
  cle: string;
  libelle: string;
  consigne: string;
  champ: PaieImportEcart['champs'][number]['champ'];
}

const MODELES_ECARTS: Modele[] = [
  { cle: 'mutation', champ: 'chantier', libelle: 'Mutations de chantier', consigne: 'Le fichier place ces employés sur un autre chantier que leur fiche.' },
  { cle: 'equipe', champ: 'equipe', libelle: 'Changements d’équipe', consigne: 'Le fichier range ces employés dans une autre équipe que leur fiche.' },
  { cle: 'fonction', champ: 'fonction', libelle: 'Changements de fonction', consigne: 'Le fichier donne à ces employés une autre fonction que leur fiche.' },
  { cle: 'salaire', champ: 'salaire', libelle: 'Révisions de salaire', consigne: 'Le salaire du fichier n’est pas celui de la fiche : précisez s’il est mensuel ou journalier.' },
  { cle: 'nom', champ: 'nomPrenom', libelle: 'Noms écrits autrement', consigne: 'L’orthographe du nom diffère entre le fichier et la fiche (faute de frappe probable).' }
];

/** Les écarts rangés par nature, dans l'ordre de traitement ; une nature sans cas n'apparaît pas. */
export function sousCategoriesEcarts(ecarts: PaieImportEcart[]): SousCategorie<PaieImportEcart>[] {
  const restants = new Map(ecarts.map((e) => [e.employeId, e]));
  const resultat: SousCategorie<PaieImportEcart>[] = [];
  for (const modele of MODELES_ECARTS) {
    const elements = [...restants.values()].filter((e) => e.champs.some((c) => c.champ === modele.champ));
    elements.forEach((e) => restants.delete(e.employeId));
    if (elements.length > 0) {
      resultat.push({ cle: modele.cle, libelle: modele.libelle, consigne: modele.consigne, elements });
    }
  }
  return resultat;
}

const MODELES_AVERTISSEMENTS: Record<string, { libelle: string; consigne: string }> = {
  EQUIPE_VIDE: { libelle: 'Équipe laissée vide dans le fichier', consigne: 'La fiche a une équipe, la ligne n’en porte pas : conserver ou vider ?' },
  SALAIRE_DIFFERENT: { libelle: 'Salaire différent de la dernière paie', consigne: 'Le salaire a changé depuis la dernière paie.' },
  SALAIRE_ZERO: { libelle: 'Salaire nul', consigne: 'La ligne indique un salaire de 0.' }
};

/** Les avertissements rangés par motif, dans l'ordre des motifs connus puis les autres. */
export function sousCategoriesAvertissements(avertissements: PaieImportErreur[]): SousCategorie<PaieImportErreur>[] {
  const groupes = new Map<string, PaieImportErreur[]>();
  for (const avertissement of avertissements) {
    const cle = avertissement.codeAvertissement ?? 'AUTRE';
    groupes.set(cle, [...(groupes.get(cle) ?? []), avertissement]);
  }
  const connus = Object.keys(MODELES_AVERTISSEMENTS);
  return [...groupes.entries()]
    .sort(([a], [b]) => (connus.indexOf(a) + 1 || 99) - (connus.indexOf(b) + 1 || 99))
    .map(([cle, elements]) => ({
      cle,
      libelle: MODELES_AVERTISSEMENTS[cle]?.libelle ?? 'Autres points à confirmer',
      consigne: MODELES_AVERTISSEMENTS[cle]?.consigne ?? '',
      elements
    }));
}
