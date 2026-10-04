package staport.rh.audit.context;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Détermine le {@link ContexteAudit} du thread courant, dans cet ordre : le contexte d'un traitement hors requête
 * ({@link BatchAuditContext}), puis l'utilisateur authentifié de la requête (claims {@code uid} et {@code sub} du
 * JWT — aucune requête en base), puis, faute de mieux, un visiteur anonyme (requête sans authentification) ou
 * « Système » d'origine {@link Origine#INCONNUE}. Utilisé par l'écouteur de révision Envers (qui n'est pas un bean
 * Spring) et par l'écrivain du journal : un seul résolveur, donc une seule identité pour une même opération.
 */
public final class ResolveurContexteAudit {

    /** Clé MDC de l'identifiant de requête (posé par {@code MdcRequestFilter}, ou par {@link BatchAuditContext}). */
    public static final String MDC_REQUEST_ID = "requestId";

    public static final String SYSTEME = "Système";
    public static final String ANONYME = "Anonyme";

    private static final String CLAIM_USER_ID = "uid";
    private static final int USER_AGENT_LONGUEUR_MAX = 255;

    private ResolveurContexteAudit() {
    }

    public static ContexteAudit courant() {
        HttpServletRequest requete = requeteCourante();
        String adresseIp = requete != null ? requete.getRemoteAddr() : null;
        String userAgent = requete != null ? tronquer(requete.getHeader("User-Agent")) : null;

        BatchAuditContext.Contexte batch = BatchAuditContext.courant();
        if (batch != null) {
            return new ContexteAudit(null, batch.utilisateurNom(), batch.origine(), batch.requestId(), adresseIp, userAgent);
        }

        String requestId = MDC.get(MDC_REQUEST_ID);
        Authentication authentification = SecurityContextHolder.getContext().getAuthentication();
        if (authentification instanceof JwtAuthenticationToken jeton && jeton.isAuthenticated()) {
            Jwt jwt = jeton.getToken();
            Number id = jwt.getClaim(CLAIM_USER_ID);
            return new ContexteAudit(id != null ? id.longValue() : null, jwt.getSubject(), Origine.API, requestId,
                    adresseIp, userAgent);
        }
        if (requete != null) {
            return new ContexteAudit(null, ANONYME, Origine.API, requestId, adresseIp, userAgent);
        }
        return new ContexteAudit(null, SYSTEME, Origine.INCONNUE, requestId, null, null);
    }

    private static HttpServletRequest requeteCourante() {
        RequestAttributes attributs = RequestContextHolder.getRequestAttributes();
        return attributs instanceof ServletRequestAttributes servlet ? servlet.getRequest() : null;
    }

    private static String tronquer(String valeur) {
        if (valeur == null) {
            return null;
        }
        return valeur.length() <= USER_AGENT_LONGUEUR_MAX ? valeur : valeur.substring(0, USER_AGENT_LONGUEUR_MAX);
    }
}
