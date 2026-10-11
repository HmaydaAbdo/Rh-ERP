package staport.rh.common.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.filter.OncePerRequestFilter;
import staport.rh.audit.context.ResolveurContexteAudit;

import java.io.IOException;
import java.util.UUID;

/**
 * Pose {@code requestId} et {@code userId} dans le MDC pour toute la durée d'une requête (conventions/logging.md) :
 * tous les logs de la requête, mais aussi les révisions et le journal d'audit (qui lisent le même identifiant),
 * peuvent ainsi être reliés. L'identifiant est <strong>toujours généré ici</strong>, jamais repris d'un en-tête du
 * client — il relie l'audit aux logs, un client ne doit pas pouvoir le choisir — et renvoyé dans l'en-tête de
 * réponse {@value #EN_TETE_REQUEST_ID}.
 *
 * <p>Ce filtre est posé par {@code SecurityConfig} juste après l'authentification par jeton (et non comme filtre
 * serveur indépendant) : l'utilisateur est alors connu, et les contrôles d'accès qui suivent — donc leurs refus —
 * portent déjà l'identifiant.
 */
public class MdcRequestFilter extends OncePerRequestFilter {

    public static final String EN_TETE_REQUEST_ID = "X-Request-Id";
    static final String MDC_USER_ID = "userId";
    private static final String CLAIM_USER_ID = "uid";

    @Override
    protected void doFilterInternal(HttpServletRequest requete, HttpServletResponse reponse, FilterChain chaine)
            throws ServletException, IOException {
        String requestId = UUID.randomUUID().toString();
        MDC.put(ResolveurContexteAudit.MDC_REQUEST_ID, requestId);
        Long userId = utilisateurAuthentifie();
        if (userId != null) {
            MDC.put(MDC_USER_ID, userId.toString());
        }
        reponse.setHeader(EN_TETE_REQUEST_ID, requestId);
        RequestAttributes attributsPrecedents = RequestContextHolder.getRequestAttributes();
        ServletRequestAttributes attributsRequete = null;
        if (attributsPrecedents == null) {
            attributsRequete = new ServletRequestAttributes(requete, reponse);
            RequestContextHolder.setRequestAttributes(attributsRequete);
        }
        try {
            chaine.doFilter(requete, reponse);
        } finally {
            if (attributsRequete != null) {
                attributsRequete.requestCompleted();
                RequestContextHolder.resetRequestAttributes();
            }
            MDC.remove(ResolveurContexteAudit.MDC_REQUEST_ID);
            MDC.remove(MDC_USER_ID);
        }
    }

    private static Long utilisateurAuthentifie() {
        Authentication authentification = SecurityContextHolder.getContext().getAuthentication();
        if (authentification instanceof JwtAuthenticationToken jeton && jeton.isAuthenticated()) {
            Number id = jeton.getToken().getClaim(CLAIM_USER_ID);
            return id != null ? id.longValue() : null;
        }
        return null;
    }
}
