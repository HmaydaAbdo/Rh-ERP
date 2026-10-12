package staport.rh.audit.events;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.web.AuthenticationEntryPoint;
import staport.rh.audit.context.ContexteAudit;
import staport.rh.audit.context.Origine;
import staport.rh.audit.context.ResolveurContexteAudit;
import staport.rh.audit.entities.AuditJournalEntry;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.ResultatAudit;
import staport.rh.audit.metrics.AuditMetrics;
import staport.rh.audit.services.AuditJournalWriter;
import staport.rh.audit.services.interfaces.IAuditJournalWriter;
import staport.rh.audit.web.AuditRequeteHttpAttributes;
import staport.rh.common.logging.MdcRequestFilter;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/** Préserve la réponse Bearer standard et trace les refus 401 émis avant l'entrée dans MVC. */
public class AuditAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private static final Logger log = LoggerFactory.getLogger(AuditAuthenticationEntryPoint.class);

    private final AuthenticationEntryPoint delegue = new BearerTokenAuthenticationEntryPoint();
    private final IAuditJournalWriter ecrivain;
    private final AuditMetrics metriques;
    private final JsonMapper jsonMapper;

    public AuditAuthenticationEntryPoint(IAuditJournalWriter ecrivain, AuditMetrics metriques, JsonMapper jsonMapper) {
        this.ecrivain = ecrivain;
        this.metriques = metriques;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public void commence(HttpServletRequest requete, HttpServletResponse reponse,
                         AuthenticationException exception) throws IOException, ServletException {
        delegue.commence(requete, reponse, exception);
        if (reponse.getStatus() != HttpServletResponse.SC_UNAUTHORIZED
                || Boolean.TRUE.equals(requete.getAttribute(AuditRequeteHttpAttributes.ACTION_AUDITEE))) {
            return;
        }

        String requestIdPrecedent = MDC.get(ResolveurContexteAudit.MDC_REQUEST_ID);
        String requestId = requestIdPrecedent;
        if (requestId == null) {
            requestId = UUID.randomUUID().toString();
            reponse.setHeader(MdcRequestFilter.EN_TETE_REQUEST_ID, requestId);
            MDC.put(ResolveurContexteAudit.MDC_REQUEST_ID, requestId);
        }
        try {
            Map<String, Object> perimetre = new LinkedHashMap<>();
            perimetre.put("methode", requete.getMethod());
            perimetre.put("route", routeSansIdentifiants(requete.getServletPath()));
            perimetre.put("statutHttp", reponse.getStatus());
            String userAgent = requete.getHeader("User-Agent");
            if (userAgent != null && userAgent.length() > 255) {
                userAgent = userAgent.substring(0, 255);
            }
            ContexteAudit contexte = new ContexteAudit(null, ResolveurContexteAudit.ANONYME, Origine.API, requestId,
                    requete.getRemoteAddr(), userAgent);
            AuditJournalEntry entree = AuditJournalWriter.entreePour(contexte)
                    .categorie(CategorieAudit.SECURITE)
                    .action("ACCES_ANONYME_REFUSE")
                    .resultat(ResultatAudit.ECHEC)
                    .motif("HTTP_401")
                    .perimetre(jsonMapper.writeValueAsString(perimetre))
                    .build();
            ecrivain.ecrireSeparement(entree);
            requete.setAttribute(AuditRequeteHttpAttributes.ACTION_AUDITEE, Boolean.TRUE);
        } catch (RuntimeException impossible) {
            metriques.ecritureEnEchec(CategorieAudit.SECURITE);
            log.error("Refus HTTP 401 non tracé : méthode={}", requete.getMethod(), impossible);
        } finally {
            if (requestIdPrecedent == null) {
                MDC.remove(ResolveurContexteAudit.MDC_REQUEST_ID);
            }
        }
    }

    /** Route de refus avant MVC : conserve l'action demandée, sans exposer un identifiant transmis dans le chemin. */
    private static String routeSansIdentifiants(String chemin) {
        return Arrays.stream(chemin.split("/", -1))
                .map(segment -> segment.matches("\\d+") || segment.matches(
                        "(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
                        ? "{id}" : segment)
                .reduce((gauche, droite) -> gauche + "/" + droite)
                .orElse("/");
    }
}
