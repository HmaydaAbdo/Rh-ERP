package staport.rh.audit.context;

/**
 * Qui agit, d'où, et sous quel identifiant de requête, à l'instant où une révision ou une entrée du journal est
 * écrite. Résolu par {@link ResolveurContexteAudit} ; l'identité est figée dans l'historique (un compte renommé
 * ou désactivé plus tard ne change pas ce qui a été enregistré).
 */
public record ContexteAudit(
        Long utilisateurId,
        String utilisateurNom,
        Origine origine,
        String requestId,
        String adresseIp,
        String userAgent
) {
}
