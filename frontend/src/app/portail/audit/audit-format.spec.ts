import { ACTIONS_AUDIT, formaterHorodatage, libelleAction, libelleChamp, libelleEntite } from './audit-format';

describe('audit-format', () => {
  it('affiche la date et l’heure, vide quand il n’y a pas d’instant', () => {
    // Le décalage exact dépend de la base de fuseaux du navigateur : on vérifie la forme et la cohérence, pas l'heure.
    expect(formaterHorodatage('2026-10-04T20:00:00Z')).toMatch(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}:\d{2}$/);
    expect(formaterHorodatage('2026-10-04T20:00:00Z')).not.toBe(formaterHorodatage('2026-10-04T21:00:00Z'));
    expect(formaterHorodatage(null)).toBe('');
  });

  it('traduit les actions connues et laisse le code des autres (ajoutées plus tard)', () => {
    expect(libelleAction('PAIE_SUPPRESSION_GROUPE')).toBe('Suppression en groupe de bulletins');
    expect(libelleAction('ACTION_FUTURE')).toBe('ACTION_FUTURE');
  });

  it('propose chaque action du catalogue avec un libellé distinct', () => {
    const libelles = ACTIONS_AUDIT.map((a) => a.libelle);
    expect(new Set(libelles).size).toBe(libelles.length);
    expect(ACTIONS_AUDIT.map((a) => a.code)).toContain('ACCES_REFUSE');
    expect(ACTIONS_AUDIT.map((a) => a.code)).toEqual(expect.arrayContaining([
      'LECTURE_METIER',
      'PAIE_RESTAURATION_GROUPE',
      'PARAMETRE_MODIFICATION',
      'COMPTE_BLOQUE_TEMPORAIREMENT',
      'ACCES_ANONYME_REFUSE'
    ]));
  });

  it('nomme les entités et les champs, ou garde leur nom technique', () => {
    expect(libelleEntite('Paie')).toBe('Bulletin de paie');
    expect(libelleEntite('Parametre')).toBe('Paramètre');
    expect(libelleEntite('Inconnue')).toBe('Inconnue');
    expect(libelleChamp('salaireTotal')).toBe('Salaire total');
    expect(libelleChamp('champInconnu')).toBe('champInconnu');
  });
});
