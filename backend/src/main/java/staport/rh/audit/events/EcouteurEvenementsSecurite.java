package staport.rh.audit.events;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authorization.event.AuthorizationDeniedEvent;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import staport.rh.audit.context.ContexteAudit;
import staport.rh.audit.context.ResolveurContexteAudit;
import staport.rh.audit.entities.AuditJournalEntry;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.metrics.AuditMetrics;
import staport.rh.audit.services.AuditJournalWriter;
import staport.rh.audit.web.AuditRequeteHttpAttributes;
import tools.jackson.databind.json.JsonMapper;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * L'unique écrivain des événements de sécurité (conventions/audit.md). Deux sources :
 * <ul>
 *   <li>les {@link EvenementSecurite} publiés par les services d'authentification ;</li>
 *   <li>les refus d'accès ({@code 403}) publiés par Spring Security lui-même — {@link AuthorizationDeniedEvent} —
 *       pour les contrôles de méthode ({@code @PreAuthorize}) comme pour ceux de la chaîne de filtres : un seul point
 *       d'accroche pour tous les refus. Un visiteur non authentifié (qui reçoit un {@code 401}) n'est pas un refus.</li>
 * </ul>
 *
 * <p><strong>Ouvert en cas d'échec</strong> : si l'événement ne peut pas s'écrire, l'opération continue (une panne
 * d'audit ne doit pas empêcher tout le monde de se connecter) ; l'erreur est loguée et comptée.
 */
@Component
public class EcouteurEvenementsSecurite {

    private static final Logger log = LoggerFactory.getLogger(EcouteurEvenementsSecurite.class);

    private final AuditJournalWriter ecrivain;
    private final AuditMetrics metriques;
    private final JsonMapper jsonMapper;

    public EcouteurEvenementsSecurite(AuditJournalWriter ecrivain, AuditMetrics metriques, JsonMapper jsonMapper) {
        this.ecrivain = ecrivain;
        this.metriques = metriques;
        this.jsonMapper = jsonMapper;
    }

    @EventListener
    public void surEvenement(EvenementSecurite evenement) {
        marquerRequeteCommeAuditee();
        ContexteAudit contexte = ResolveurContexteAudit.courant();
        Long utilisateurId = evenement.utilisateurId() != null ? evenement.utilisateurId() : contexte.utilisateurId();
        String utilisateurNom = evenement.utilisateurNom() != null ? evenement.utilisateurNom() : contexte.utilisateurNom();
        ecrire(evenement.action(), contexte, utilisateurId, utilisateurNom, evenement.motif(), evenement.details());
    }

    @EventListener
    public void surRefus(AuthorizationDeniedEvent<?> refus) {
        Authentication authentification = refus.getAuthentication().get();
        if (authentification == null || authentification instanceof AnonymousAuthenticationToken || !authentification.isAuthenticated()) {
            return;
        }
        ContexteAudit contexte = ResolveurContexteAudit.courant();
        Map<String, Object> details = new LinkedHashMap<>();
        RequestAttributes attributs = RequestContextHolder.getRequestAttributes();
        if (attributs instanceof ServletRequestAttributes servlet) {
            HttpServletRequest requete = servlet.getRequest();
            requete.setAttribute(AuditRequeteHttpAttributes.ACTION_AUDITEE, Boolean.TRUE);
            details.put("methode", requete.getMethod());
            details.put("route", requete.getRequestURI());
        }
        ecrire(ActionSecurite.ACCES_REFUSE, contexte, contexte.utilisateurId(), contexte.utilisateurNom(), null, details);
    }

    private void ecrire(ActionSecurite action, ContexteAudit contexte, Long utilisateurId, String utilisateurNom,
                        String motif, Map<String, Object> details) {
        try {
            AuditJournalEntry.Builder entree = AuditJournalWriter.entreePour(contexte)
                    .utilisateurId(utilisateurId)
                    .utilisateurNom(utilisateurNom)
                    .categorie(CategorieAudit.SECURITE)
                    .action(action.name())
                    .resultat(action.resultat())
                    .motif(motif);
            if (details != null && !details.isEmpty()) {
                entree.perimetre(jsonMapper.writeValueAsString(details));
            }
            ecrivain.ecrireSeparement(entree.build());
            metriques.evenementSecurite(action);
        } catch (RuntimeException impossible) {
            metriques.ecritureEnEchec(CategorieAudit.SECURITE);
            log.error("Événement de sécurité impossible à écrire : action={}", action, impossible);
        }
    }

    private static void marquerRequeteCommeAuditee() {
        RequestAttributes attributs = RequestContextHolder.getRequestAttributes();
        if (attributs instanceof ServletRequestAttributes servlet) {
            servlet.getRequest().setAttribute(AuditRequeteHttpAttributes.ACTION_AUDITEE, Boolean.TRUE);
        }
    }
}
