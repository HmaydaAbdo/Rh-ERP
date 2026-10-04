package staport.rh.audit.entities;

/**
 * Nature d'une opération d'écriture. Une méthode « upsert » est un {@link #UPDATE} (conventions/audit.md).
 * {@link #AUCUN} n'est jamais enregistré : c'est la valeur par défaut de {@code @AuditableAction} pour une action
 * qui n'écrit pas (catégorie {@code ACCES}).
 */
public enum TypeOperation {
    CREATE,
    UPDATE,
    DELETE,
    AUCUN
}
