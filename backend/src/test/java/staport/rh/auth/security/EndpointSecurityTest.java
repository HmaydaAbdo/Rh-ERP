package staport.rh.auth.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Vérifie l'application RÉELLE des {@code @PreAuthorize} sur tous les endpoints, sans base de données :
 * chaque {@code @RestController} du projet est instancié (dépendances simulées) derrière le vrai
 * mécanisme de sécurité par méthode ({@code @EnableMethodSecurity}), puis chaque endpoint est appelé
 * avec une identité n'ayant pas la permission requise (accès refusé attendu) et avec celle qui l'a
 * (jamais refusé). Les contrôleurs sont découverts automatiquement : un nouvel endpoint sans
 * {@code @PreAuthorize}, ou protégé par une permission que l'annotation ne porte pas réellement, fait
 * échouer ce test (conventions/security.md — « tout nouvel endpoint définit explicitement sa permission »).
 *
 * <p>Seul {@code AuthController} est exclu : ses endpoints sont publics ou « authentifié simplement »,
 * protégés par la chaîne de filtres ({@code SecurityConfig}), pas par une permission métier.
 */
class EndpointSecurityTest {

    private static final Pattern HAS_AUTHORITY = Pattern.compile("hasAuthority\\('([^']+)'\\)");
    private static final Pattern HAS_ANY_AUTHORITY = Pattern.compile("hasAnyAuthority\\(([^)]*)\\)");
    private static final Pattern QUOTED_AUTHORITY = Pattern.compile("'([^']+)'");
    private static final String PERMISSION_INCONNUE = "PERMISSION_QUI_N_EXISTE_PAS";

    /**
     * Table de référence endpoint → permission (miroir de {@code docs/rbac/*.md}). Toute modification
     * d'une permission, ou tout nouvel endpoint, doit être répercuté ici ET dans la doc RBAC : sans cela
     * le test échoue. C'est ce qui détecte une permission « affaiblie » par erreur (ex. DELETE protégé
     * par READ), qu'un test dérivé de l'annotation elle-même ne verrait pas.
     */
    private static final Map<String, String> PERMISSIONS_ATTENDUES = Map.ofEntries(
            Map.entry("AgentController.emettre", "IA_UTILISER"),
            Map.entry("AuditController.rechercher", "AUDIT_READ"),
            Map.entry("AuditController.lireParId", "AUDIT_READ"),
            Map.entry("AuditController.details", "AUDIT_READ"),
            Map.entry("AuditController.historique", "AUDIT_READ"),
            Map.entry("ChantierController.creer", "CHANTIER_WRITE"),
            Map.entry("ChantierController.modifier", "CHANTIER_WRITE"),
            Map.entry("ChantierController.lireParId", "CHANTIER_READ"),
            Map.entry("ChantierController.rechercher", "CHANTIER_READ"),
            Map.entry("ChantierController.supprimer", "CHANTIER_DELETE"),
            Map.entry("ChantierSyncController.synchroniser", "CHANTIER_SYNC"),
            Map.entry("EmployeeController.creer", "EMPLOYEE_WRITE"),
            Map.entry("EmployeeController.modifier", "EMPLOYEE_WRITE"),
            Map.entry("EmployeeController.lireParId", "EMPLOYEE_READ"),
            Map.entry("EmployeeController.rechercher", "EMPLOYEE_READ"),
            Map.entry("EmployeeController.supprimer", "EMPLOYEE_DELETE"),
            Map.entry("EmployeeImportController.importer", "EMPLOYEE_IMPORT"),
            Map.entry("EmployeeImportController.telechargerModele", "EMPLOYEE_IMPORT"),
            Map.entry("EquipeController.creer", "EQUIPE_WRITE"),
            Map.entry("EquipeController.modifier", "EQUIPE_WRITE"),
            Map.entry("EquipeController.lireParId", "EQUIPE_READ"),
            Map.entry("EquipeController.rechercher", "EQUIPE_READ"),
            Map.entry("EquipeController.supprimer", "EQUIPE_DELETE"),
            Map.entry("EquipeImportController.importer", "EQUIPE_IMPORT"),
            Map.entry("EquipeImportController.telechargerModele", "EQUIPE_IMPORT"),
            Map.entry("FunctionController.creer", "FUNCTION_WRITE"),
            Map.entry("FunctionController.modifier", "FUNCTION_WRITE"),
            Map.entry("FunctionController.lireParId", "FUNCTION_READ"),
            Map.entry("FunctionController.rechercher", "FUNCTION_READ"),
            Map.entry("FunctionController.supprimer", "FUNCTION_DELETE"),
            Map.entry("FunctionImportController.importer", "FUNCTION_IMPORT"),
            Map.entry("FunctionImportController.telechargerModele", "FUNCTION_IMPORT"),
            Map.entry("PaieController.creer", "PAIE_WRITE&EMPLOYEE_WRITE"),
            Map.entry("PaieController.modifier", "PAIE_WRITE&EMPLOYEE_WRITE"),
            Map.entry("PaieController.lireParId", "PAIE_READ"),
            Map.entry("PaieController.rechercher", "PAIE_READ"),
            Map.entry("PaieController.rechercherOptionsChantiers", "PAIE_READ"),
            Map.entry("PaieController.rechercherOptionsEquipes", "PAIE_READ"),
            Map.entry("PaieController.supprimer", "PAIE_DELETE"),
            Map.entry("PaieController.supprimerGroupe", "PAIE_PURGE"),
            Map.entry("PaieController.restaurerGroupe", "PAIE_RESTORE"),
            Map.entry("PaieController.listerPeriodes", "PAIE_READ"),
            Map.entry("PaieController.listerChantiersDeLaPeriode", "PAIE_READ"),
            Map.entry("PaieController.listerTableauxMateriel", "PAIE_READ"),
            Map.entry("PaieController.analyser", "PAIE_READ"),
            Map.entry("PaieController.rechercherPeriodes", "PAIE_READ"),
            Map.entry("PaieController.rechercherChantiersDeLaPeriode", "PAIE_READ"),
            Map.entry("PaieExportController.exporter", "PAIE_EXPORT"),
            Map.entry("PaieParcoursController.parcours", "PAIE_READ"),
            Map.entry("PaieEffectifsController.tendances", "PAIE_READ"),
            Map.entry("EmployeeAnalytiqueController.regrouper", "EMPLOYEE_READ"),
            Map.entry("EmployeeAnalytiqueController.analyser", "EMPLOYEE_READ"),
            Map.entry("PaieImportController.analyser", "PAIE_IMPORT&PAIE_READ"),
            Map.entry("PaieImportController.corriger", "PAIE_IMPORT&EMPLOYEE_WRITE&PAIE_READ"),
            Map.entry("PaieImportController.importer", "PAIE_IMPORT"),
            Map.entry("PaieImportController.telechargerModele", "PAIE_IMPORT"),
            Map.entry("PaieReportController.telecharger", "PAIE_EXPORT"),
            Map.entry("ParametreController.findAll", "PARAMETRE_READ"),
            Map.entry("ParametreController.update", "PARAMETRE_WRITE"),
            Map.entry("RoleController.search", "ROLE_MANAGE"),
            Map.entry("RoleController.findById", "ROLE_MANAGE"),
            Map.entry("RoleController.create", "ROLE_MANAGE"),
            Map.entry("RoleController.update", "ROLE_MANAGE"),
            Map.entry("RoleController.delete", "ROLE_MANAGE"),
            Map.entry("RoleController.findAllPermissions", "ROLE_MANAGE|USER_MANAGE"),
            Map.entry("UserController.search", "USER_MANAGE"),
            Map.entry("UserController.findById", "USER_MANAGE"),
            Map.entry("UserController.create", "USER_MANAGE"),
            Map.entry("UserController.update", "USER_MANAGE"),
            Map.entry("UserController.updateDeniedPermissions", "USER_MANAGE"),
            Map.entry("UserController.adminResetPassword", "USER_MANAGE")
    );

    @Configuration
    @EnableMethodSecurity
    static class MethodSecurityConfig {
    }

    private static AnnotationConfigApplicationContext context;
    private static List<Class<?>> controleurs;

    @BeforeAll
    static void demarrerContexte() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));

        controleurs = new ArrayList<>();
        for (BeanDefinition definition : scanner.findCandidateComponents("staport.rh")) {
            Class<?> type = Class.forName(definition.getBeanClassName());
            if (!type.getSimpleName().equals("AuthController")) {
                controleurs.add(type);
            }
        }

        context = new AnnotationConfigApplicationContext();
        context.register(MethodSecurityConfig.class);
        for (Class<?> type : controleurs) {
            enregistrer(type);
        }
        context.refresh();
    }

    @SuppressWarnings("unchecked")
    private static <T> void enregistrer(Class<T> type) {
        var constructeur = type.getConstructors()[0];
        context.registerBean(type, () -> {
            Object[] dependances = new Object[constructeur.getParameterCount()];
            Class<?>[] types = constructeur.getParameterTypes();
            for (int i = 0; i < types.length; i++) {
                dependances[i] = Mockito.mock(types[i]);
            }
            try {
                return (T) constructeur.newInstance(dependances);
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException(e);
            }
        });
    }

    @AfterEach
    void viderLeContexteDeSecurite() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void lesControleursMetierSontDecouverts() {
        // Garde-fou : si la découverte automatique ne trouvait rien, les tests ci-dessous passeraient à vide.
        assertThat(controleurs).hasSizeGreaterThanOrEqualTo(8);
    }

    @Test
    void chaqueEndpointDeclareUnePermissionExplicite() {
        List<String> sansProtection = new ArrayList<>();
        List<String> expressionsNonAnalysees = new ArrayList<>();

        for (Method endpoint : endpoints()) {
            PreAuthorize annotation = preAuthorize(endpoint);
            if (annotation == null) {
                sansProtection.add(nom(endpoint));
            } else if (autorites(annotation).isEmpty()) {
                expressionsNonAnalysees.add(nom(endpoint) + " : " + annotation.value());
            }
        }

        assertThat(sansProtection).as("endpoints sans @PreAuthorize").isEmpty();
        assertThat(expressionsNonAnalysees)
                .as("expressions autres que hasAuthority('X') — adapter ce test avant d'en introduire")
                .isEmpty();
    }

    @Test
    void lesPermissionsCorrespondentALaTableDeReference() {
        Map<String, String> reelles = new TreeMap<>();
        for (Method endpoint : endpoints()) {
            PreAuthorize annotation = preAuthorize(endpoint);
            reelles.put(nom(endpoint), String.join(exigeToutes(annotation) ? "&" : "|", autorites(annotation)));
        }

        assertThat(reelles).as("endpoints et permissions (table de référence du test)")
                .isEqualTo(new TreeMap<>(PERMISSIONS_ATTENDUES));
    }

    @Test
    void chaqueEndpointRefuseUneIdentiteSansLaPermissionRequise() {
        List<String> accesNonRefuses = new ArrayList<>();

        for (Method endpoint : endpoints()) {
            authentifierAvec(PERMISSION_INCONNUE);
            if (!estRefuse(endpoint)) {
                accesNonRefuses.add(nom(endpoint));
            }
        }

        assertThat(accesNonRefuses).as("endpoints accessibles sans la permission requise").isEmpty();
    }

    @Test
    void chaqueEndpointAccepteUneIdentiteAvecLaPermissionRequise() {
        List<String> accesRefuses = new ArrayList<>();

        for (Method endpoint : endpoints()) {
            authentifierAvec(autorites(preAuthorize(endpoint)).toArray(String[]::new));
            if (estRefuse(endpoint)) {
                accesRefuses.add(nom(endpoint) + " avec " + String.join(", ", autorites(preAuthorize(endpoint))));
            }
        }

        assertThat(accesRefuses).as("endpoints refusés malgré la permission requise").isEmpty();
    }

    @Test
    void uneExigenceCombineeRefuseChaquePermissionPriseSeule() {
        List<String> accesPartiels = new ArrayList<>();

        for (Method endpoint : endpoints()) {
            PreAuthorize annotation = preAuthorize(endpoint);
            if (!exigeToutes(annotation)) {
                continue;
            }
            for (String seule : autorites(annotation)) {
                authentifierAvec(seule);
                if (!estRefuse(endpoint)) {
                    accesPartiels.add(nom(endpoint) + " accessible avec " + seule + " seule");
                }
            }
        }

        assertThat(accesPartiels).as("endpoints accessibles sans toutes les permissions exigées").isEmpty();
    }

    @Test
    void uneAutrePermissionDuMemeDomaineNeDonnePasAcces() {
        // La lecture ne donne jamais l'écriture ni la suppression, et inversement : une identité
        // portant UNE seule permission *_READ ne doit passer aucun endpoint exigeant autre chose.
        List<String> trops = new ArrayList<>();

        for (Method endpoint : endpoints()) {
            List<String> requises = autorites(preAuthorize(endpoint));
            String requise = requises.get(0);
            if (!requise.endsWith("_READ")) {
                String lecture = requise.substring(0, requise.lastIndexOf('_')) + "_READ";
                authentifierAvec(lecture);
                if (!estRefuse(endpoint)) {
                    trops.add(nom(endpoint) + " accessible avec " + lecture);
                }
            }
        }

        assertThat(trops).as("endpoints accessibles avec la seule permission de lecture").isEmpty();
    }

    private List<Method> endpoints() {
        List<Method> endpoints = new ArrayList<>();
        for (Class<?> type : controleurs) {
            for (Method methode : type.getDeclaredMethods()) {
                if (AnnotatedElementUtils.hasAnnotation(methode, RequestMapping.class)) {
                    endpoints.add(methode);
                }
            }
        }
        assertThat(endpoints).isNotEmpty();
        return endpoints;
    }

    private PreAuthorize preAuthorize(Method endpoint) {
        PreAuthorize surMethode = AnnotatedElementUtils.findMergedAnnotation(endpoint, PreAuthorize.class);
        return surMethode != null
                ? surMethode
                : AnnotatedElementUtils.findMergedAnnotation(endpoint.getDeclaringClass(), PreAuthorize.class);
    }

    /** {@code hasAuthority('A') and hasAuthority('B')} : toutes les permissions sont exigées ensemble. */
    private static boolean exigeToutes(PreAuthorize annotation) {
        return annotation.value().contains(" and ");
    }

    private List<String> autorites(PreAuthorize annotation) {
        Matcher simple = HAS_AUTHORITY.matcher(annotation.value());
        if (exigeToutes(annotation)) {
            List<String> toutes = new ArrayList<>();
            while (simple.find()) {
                toutes.add(simple.group(1));
            }
            return toutes;
        }
        if (simple.find()) {
            return List.of(simple.group(1));
        }
        Matcher multiple = HAS_ANY_AUTHORITY.matcher(annotation.value());
        if (!multiple.find()) {
            return List.of();
        }
        Matcher quoted = QUOTED_AUTHORITY.matcher(multiple.group(1));
        List<String> autorites = new ArrayList<>();
        while (quoted.find()) {
            autorites.add(quoted.group(1));
        }
        return autorites;
    }

    private void authentifierAvec(String... permissions) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("test", "test", permissions));
    }

    /** Appelle l'endpoint via le proxy de sécurité (arguments nuls) : seule la décision d'accès importe,
     * toute autre exception levée par le corps du contrôleur (arguments absents) est sans intérêt ici. */
    private boolean estRefuse(Method endpoint) {
        Object proxy = context.getBean(endpoint.getDeclaringClass());
        Object[] arguments = new Object[endpoint.getParameterCount()];
        Class<?>[] types = endpoint.getParameterTypes();
        for (int i = 0; i < types.length; i++) {
            arguments[i] = types[i].isPrimitive() ? valeurParDefaut(types[i]) : null;
        }
        try {
            endpoint.setAccessible(true);
            endpoint.invoke(proxy, arguments);
            return false;
        } catch (InvocationTargetException e) {
            return e.getCause() instanceof AccessDeniedException;
        } catch (IllegalAccessException e) {
            throw new IllegalStateException(e);
        }
    }

    private Object valeurParDefaut(Class<?> primitif) {
        if (primitif == boolean.class) {
            return false;
        }
        if (primitif == char.class) {
            return '\0';
        }
        return 0;
    }

    private String nom(Method endpoint) {
        return endpoint.getDeclaringClass().getSimpleName() + "." + endpoint.getName();
    }
}
