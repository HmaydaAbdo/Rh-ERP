package staport.rh.audit.events;

import staport.rh.audit.entities.ResultatAudit;

/**
 * Les événements de sécurité journalisés (conventions/audit.md, « Événements de sécurité »). Les secrets de session
 * ne sont jamais conservés ; seul leur cycle de vie, leur résultat et un motif catégorisé sont tracés.
 */
public enum ActionSecurite {
    CONNEXION_REUSSIE(ResultatAudit.SUCCES),
    CONNEXION_ECHOUEE(ResultatAudit.ECHEC),
    SESSION_RENOUVELEE(ResultatAudit.SUCCES),
    SESSION_RENOUVELLEMENT_REFUSE(ResultatAudit.ECHEC),
    SESSIONS_REVOQUEES(ResultatAudit.SUCCES),
    DECONNEXION(ResultatAudit.SUCCES),
    /** Un jeton de rafraîchissement déjà consommé a été présenté de nouveau : vol présumé. */
    JETON_REUTILISE(ResultatAudit.ECHEC),
    MOT_DE_PASSE_OUBLIE(ResultatAudit.SUCCES),
    MOT_DE_PASSE_REINITIALISE(ResultatAudit.SUCCES),
    MOT_DE_PASSE_REINITIALISE_PAR_ADMIN(ResultatAudit.SUCCES),
    ACCES_REFUSE(ResultatAudit.ECHEC);

    private final ResultatAudit resultat;

    ActionSecurite(ResultatAudit resultat) {
        this.resultat = resultat;
    }

    public ResultatAudit resultat() {
        return resultat;
    }
}
