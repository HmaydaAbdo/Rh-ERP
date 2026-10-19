package staport.rh.employee.entities;

/**
 * Façon dont l'employé est payé : {@code salaire} porte un montant mensuel, ou le tarif d'une journée (le total du mois vaut
 * alors tarif × jours travaillés, voir docs/paie/README.md, « Règles métier »).
 */
public enum TypeSalaire {
    MENSUEL,
    JOURNALIER
}
