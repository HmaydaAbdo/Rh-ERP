package staport.rh.audit.web;

/** Attributs de requête partagés entre les points d'audit HTTP afin d'éviter les doublons. */
public final class AuditRequeteHttpAttributes {

    public static final String ACTION_AUDITEE = AuditRequeteHttpAttributes.class.getName() + ".ACTION_AUDITEE";

    private AuditRequeteHttpAttributes() {
    }
}
