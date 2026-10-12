package staport.rh.common.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.filter.OncePerRequestFilter;
import staport.rh.audit.context.ResolveurContexteAudit;

import java.io.IOException;
import java.util.UUID;

/**
 * Pose un {@code requestId} dans le MDC pour toute la durée d'une requête : les logs techniques, les révisions et
 * le journal d'audit (qui lisent le même identifiant) peuvent ainsi être reliés sans recopier l'identité de l'acteur
 * dans les journaux techniques. L'identifiant est <strong>toujours généré ici</strong>, jamais repris d'un en-tête du
 * client — un client ne doit pas pouvoir le choisir — et renvoyé dans l'en-tête de réponse
 * {@value #EN_TETE_REQUEST_ID}.
 *
 * <p>Ce filtre est posé par {@code SecurityConfig} juste après l'authentification par jeton (et non comme filtre
 * serveur indépendant), afin que les contrôles d'accès qui suivent — donc leurs refus — portent déjà l'identifiant.
 */
public class MdcRequestFilter extends OncePerRequestFilter {

    public static final String EN_TETE_REQUEST_ID = "X-Request-Id";

    @Override
    protected void doFilterInternal(HttpServletRequest requete, HttpServletResponse reponse, FilterChain chaine)
            throws ServletException, IOException {
        String requestId = UUID.randomUUID().toString();
        MDC.put(ResolveurContexteAudit.MDC_REQUEST_ID, requestId);
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
        }
    }
}
