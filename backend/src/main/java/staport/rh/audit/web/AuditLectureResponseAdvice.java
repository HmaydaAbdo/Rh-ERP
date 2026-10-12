package staport.rh.audit.web;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.MethodParameter;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import staport.rh.audit.context.ResolveurContexteAudit;
import staport.rh.audit.entities.AuditJournalEntry;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.ResultatAudit;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.audit.metrics.AuditMetrics;
import staport.rh.audit.services.AuditJournalWriter;
import staport.rh.audit.services.interfaces.IAuditJournalWriter;
import tools.jackson.databind.json.JsonMapper;

import java.lang.reflect.Array;
import java.lang.reflect.Method;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/** Journalise les consultations et écritures HTTP avant la sérialisation de leur corps. */
@RestControllerAdvice
public class AuditLectureResponseAdvice implements ResponseBodyAdvice<Object> {

    private static final Logger log = LoggerFactory.getLogger(AuditLectureResponseAdvice.class);
    private static final String ACTION_LECTURE = "LECTURE_METIER";

    private final IAuditJournalWriter ecrivain;
    private final AuditMetrics metriques;
    private final JsonMapper jsonMapper;

    public AuditLectureResponseAdvice(IAuditJournalWriter ecrivain, AuditMetrics metriques, JsonMapper jsonMapper) {
        this.ecrivain = ecrivain;
        this.metriques = metriques;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        HttpServletRequest request = requeteServletCourante();
        return request != null && (estLectureMetier(request, returnType) || estEcritureMetier(request));
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType selectedContentType,
                                  Class<? extends HttpMessageConverter<?>> selectedConverterType,
                                  ServerHttpRequest request, ServerHttpResponse response) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)
                || !(response instanceof ServletServerHttpResponse servletResponse)) {
            return body;
        }

        HttpServletRequest requete = servletRequest.getServletRequest();
        HttpStatusCode statut = HttpStatusCode.valueOf(servletResponse.getServletResponse().getStatus());
        if (!estLectureMetier(requete, returnType)) {
            journaliserEcritureSansTraceMetier(requete, returnType, statut);
            return body;
        }
        if (Boolean.TRUE.equals(requete.getAttribute(AuditRequeteHttpAttributes.ACTION_AUDITEE))) {
            return body;
        }
        Map<String, Object> perimetre = new LinkedHashMap<>();
        Object route = requete.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        perimetre.put("route", route instanceof String chemin ? chemin : routeStable(returnType));
        perimetre.put("methode", requete.getMethod());
        perimetre.put("statutHttp", statut.value());
        ajouterPeriode(requete, perimetre);

        try {
            AuditJournalEntry entree = AuditJournalWriter.entreePour(ResolveurContexteAudit.courant())
                    .categorie(CategorieAudit.ACCES)
                    .action(ACTION_LECTURE)
                    .resultat(statut.isError() ? ResultatAudit.ECHEC : ResultatAudit.SUCCES)
                    .motif(statut.isError() ? "HTTP_" + statut.value() : null)
                    .nombreElements(statut.isError() ? 0 : nombreElements(body))
                    .perimetre(jsonMapper.writeValueAsString(perimetre))
                    .build();
            ecrivain.ecrireSeparement(entree);
            requete.setAttribute(AuditRequeteHttpAttributes.ACTION_AUDITEE, Boolean.TRUE);
            return body;
        } catch (RuntimeException impossible) {
            metriques.ecritureEnEchec(CategorieAudit.ACCES.name());
            log.error("Consultation métier non servie : sa trace d'audit n'a pas pu être écrite", impossible);
            throw new IllegalStateException("La consultation ne peut pas être servie sans sa trace d'audit", impossible);
        }
    }

    private void journaliserEcritureSansTraceMetier(HttpServletRequest requete, MethodParameter returnType,
                                                    HttpStatusCode statut) {
        if (Boolean.TRUE.equals(requete.getAttribute(AuditRequeteHttpAttributes.ACTION_AUDITEE))) {
            return;
        }
        Map<String, Object> perimetre = new LinkedHashMap<>();
        Object route = requete.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        perimetre.put("route", route instanceof String chemin ? chemin : routeStable(returnType));
        perimetre.put("methode", requete.getMethod());
        perimetre.put("statutHttp", statut.value());

        String chemin = route instanceof String pattern ? pattern : requete.getServletPath();
        boolean securite = chemin.startsWith("/auth/");
        boolean succes = !statut.isError();
        try {
            AuditJournalEntry.Builder entree = AuditJournalWriter.entreePour(ResolveurContexteAudit.courant())
                    .categorie(securite ? CategorieAudit.SECURITE : CategorieAudit.OPERATION)
                    .action(succes ? "ECRITURE_HTTP_SANS_TRACE_METIER"
                            : securite ? "TENTATIVE_HTTP_REJETEE" : "TENTATIVE_ECRITURE_HTTP_REJETEE")
                    .resultat(succes ? ResultatAudit.SUCCES : ResultatAudit.ECHEC)
                    .motif(succes ? null : "HTTP_" + statut.value())
                    .nombreElements(0)
                    .perimetre(jsonMapper.writeValueAsString(perimetre));
            if (!securite) {
                entree.typeOperation(typeOperation(requete.getMethod()));
            }
            ecrivain.ecrireSeparement(entree.build());
        } catch (RuntimeException impossible) {
            metriques.ecritureEnEchec(securite ? CategorieAudit.SECURITE.name() : CategorieAudit.OPERATION.name());
            log.error("Écriture HTTP non tracée : méthode={}, statut={}", requete.getMethod(),
                    statut.value(), impossible);
        }
    }

    private static boolean estEcritureMetier(HttpServletRequest request) {
        return "POST".equals(request.getMethod()) || "PUT".equals(request.getMethod())
                || "PATCH".equals(request.getMethod()) || "DELETE".equals(request.getMethod());
    }

    private static TypeOperation typeOperation(String methode) {
        return switch (methode) {
            case "POST" -> TypeOperation.CREATE;
            case "PUT", "PATCH" -> TypeOperation.UPDATE;
            case "DELETE" -> TypeOperation.DELETE;
            default -> TypeOperation.AUCUN;
        };
    }

    private static boolean estLectureMetier(HttpServletRequest request, MethodParameter returnType) {
        if ("GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod())) {
            return true;
        }
        if (!"POST".equals(request.getMethod())) {
            return false;
        }

        PreAuthorize autorisation = autorisation(request, returnType);
        if (autorisation == null) {
            return false;
        }
        String expression = autorisation.value();
        return expression.contains("_READ") || expression.contains("_MANAGE") || expression.contains("_EXPORT");
    }

    private static PreAuthorize autorisation(HttpServletRequest request, MethodParameter returnType) {
        Object gestionnaire = request.getAttribute(HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE);
        if (gestionnaire instanceof HandlerMethod handlerMethod) {
            PreAuthorize autorisation = autorisation(handlerMethod.getMethod(), handlerMethod.getBeanType());
            if (autorisation != null) {
                return autorisation;
            }
        }
        return autorisation(returnType.getMethod(), returnType.getContainingClass());
    }

    private static PreAuthorize autorisation(Method methode, Class<?> classe) {
        if (methode != null) {
            PreAuthorize annotationMethode = methode.getAnnotation(PreAuthorize.class);
            if (annotationMethode != null) {
                return annotationMethode;
            }
        }
        return classe.getAnnotation(PreAuthorize.class);
    }

    private static HttpServletRequest requeteServletCourante() {
        RequestAttributes attributs = RequestContextHolder.getRequestAttributes();
        return attributs instanceof ServletRequestAttributes servlet
                ? servlet.getRequest() : null;
    }

    private static String routeStable(MethodParameter returnType) {
        Method methode = returnType.getMethod();
        return methode == null ? "ROUTE_API" : returnType.getContainingClass().getSimpleName() + "#" + methode.getName();
    }

    private static void ajouterPeriode(HttpServletRequest request, Map<String, Object> perimetre) {
        String periode = request.getParameter("periode");
        if (!StringUtils.hasText(periode)) {
            return;
        }
        try {
            perimetre.put("periode", YearMonth.parse(periode).toString());
        } catch (DateTimeParseException ignore) {
            // Ne pas copier une valeur de requête libre dans le journal.
        }
    }

    private static int nombreElements(Object body) {
        if (body == null) {
            return 0;
        }
        if (body instanceof Page<?> page) {
            return page.getNumberOfElements();
        }
        if (body instanceof Collection<?> collection) {
            return Math.min(collection.size(), Integer.MAX_VALUE);
        }
        if (body.getClass().isArray()) {
            return Array.getLength(body);
        }
        return 1;
    }
}
