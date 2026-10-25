package staport.rh.mcp.outils;

import org.springframework.security.core.Authentication;
import staport.rh.audit.services.interfaces.IAuditOutilsAgent;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BiFunction;

/**
 * Outil de lecture décrit en une déclaration (nom, permissions, schémas, exécution) : forme des catalogues de domaine
 * ({@code OutilsReferentiels}, {@code OutilsEmploye}, {@code OutilsPaie}, {@code OutilsAdministration}). Mêmes garanties
 * que {@link OutilLecture} : permission revérifiée, journal, erreurs sans trace interne.
 */
final class OutilDefini extends OutilLecture {

    private final String nom;
    private final String description;
    private final Set<String> permissions;
    private final Map<String, Object> entree;
    private final Map<String, Object> sortie;
    private final BiFunction<Authentication, Arguments, Resultat> execution;

    private OutilDefini(Builder b, IAuditOutilsAgent audit) {
        super(audit);
        this.nom = b.nom;
        this.description = b.description;
        this.permissions = Set.copyOf(b.permissions);
        this.entree = Map.copyOf(b.entree);
        this.sortie = objet(Map.copyOf(b.sortie), List.copyOf(b.requis));
        this.execution = b.execution;
    }

    static Builder outil(String nom) {
        return new Builder(nom);
    }

    @Override
    protected String nom() {
        return nom;
    }

    @Override
    protected String description() {
        return description;
    }

    @Override
    protected Set<String> permissions() {
        return permissions;
    }

    @Override
    protected Map<String, Object> proprietesEntree() {
        return entree;
    }

    @Override
    protected Map<String, Object> schemaSortie() {
        return sortie;
    }

    @Override
    protected Resultat executer(Authentication lecteur, Arguments arguments) {
        return execution.apply(lecteur, arguments);
    }

    static final class Builder {
        private final String nom;
        private String description = "";
        private Set<String> permissions = Set.of();
        private Map<String, Object> entree = Map.of();
        private Map<String, Object> sortie = Map.of();
        private List<String> requis = List.of();
        private BiFunction<Authentication, Arguments, Resultat> execution;

        private Builder(String nom) {
            this.nom = nom;
        }

        Builder description(String description) {
            this.description = description;
            return this;
        }

        Builder permissions(String... permissions) {
            this.permissions = Set.of(permissions);
            return this;
        }

        Builder entree(Map<String, Object> proprietes) {
            this.entree = proprietes;
            return this;
        }

        /** Propriétés de sortie ; toutes requises sauf celles qui peuvent manquer selon les droits du lecteur. */
        Builder sortie(Map<String, Object> proprietes, String... requis) {
            this.sortie = proprietes;
            this.requis = List.of(requis);
            return this;
        }

        Builder execution(BiFunction<Authentication, Arguments, Resultat> execution) {
            this.execution = execution;
            return this;
        }

        OutilLecture construire(IAuditOutilsAgent audit) {
            return new OutilDefini(this, audit);
        }
    }

    // --- fragments de schéma partagés par les catalogues ---

    static Map<String, Object> texte(String description, int maximum) {
        return Map.of("type", "string", "minLength", 1, "maxLength", maximum, "description", description);
    }

    static Map<String, Object> identifiant(String description) {
        return Map.of("type", "integer", "minimum", 1, "description", description);
    }

    static Map<String, Object> limite(int defaut, int maximum) {
        return Map.of("type", "integer", "minimum", 1, "maximum", maximum,
                "description", "Nombre d'éléments rendus, " + defaut + " par défaut, " + maximum + " au plus");
    }

    static Map<String, Object> enumeration(String description, String... valeurs) {
        return Map.of("type", "string", "enum", List.of(valeurs), "description", description);
    }

    static Map<String, Object> liste() {
        return Map.of("type", "array", "items", Map.of("type", "object"));
    }

    static Map<String, Object> nombre() {
        return Map.of("type", "integer");
    }

    static Map<String, Object> objetLibre() {
        return Map.of("type", "object");
    }
}
