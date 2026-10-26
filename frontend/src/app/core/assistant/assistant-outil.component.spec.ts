import { libelleOutil } from './assistant-outil.component';

describe('libelleOutil', () => {
  it('nomme le domaine dans le vocabulaire de l’interface, sans le nom technique', () => {
    expect(libelleOutil('paie_mouvements')).toBe('Paie · mouvements');
    expect(libelleOutil('employes_lister')).toBe('Employés · lister');
    expect(libelleOutil('audit_journal')).toBe('Journal d’audit · journal');
  });

  it('garde un nom inconnu lisible et tolère l’absence de nom', () => {
    expect(libelleOutil('autre_chose')).toBe('autre · chose');
    expect(libelleOutil('seul')).toBe('seul');
    expect(libelleOutil(undefined)).toBe('');
  });
});
