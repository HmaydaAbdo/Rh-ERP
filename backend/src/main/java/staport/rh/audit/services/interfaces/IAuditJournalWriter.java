package staport.rh.audit.services.interfaces;

import staport.rh.audit.entities.AuditJournalEntry;

/** Point d'écriture du journal d'audit exposé aux composants transverses et aux autres domaines. */
public interface IAuditJournalWriter {

    /** Enregistre l'événement dans la transaction courante. */
    void ecrire(AuditJournalEntry entree);

    /** Enregistre l'événement dans une transaction séparée de celle de l'opération appelante. */
    void ecrireSeparement(AuditJournalEntry entree);

    /** Vide les écritures en attente via le repository pour traduire les violations de contrainte. */
    void flush();
}
