package staport.rh.mcp.outils;

import io.modelcontextprotocol.common.McpTransportContext;
import io.modelcontextprotocol.server.McpStatelessServerFeatures;
import io.modelcontextprotocol.spec.McpSchema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import staport.rh.audit.services.interfaces.IAuditOutilsAgent;
import staport.rh.mcp.config.McpServeurConfig;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Socle des outils MCP de lecture (docs/ia.md, § 5) : la permission de chaque outil est revérifiée à chaque appel sur
 * l'identité reconstruite par Spring, chaque appel servi ou refusé est journalisé, et une erreur ne renvoie jamais au
 * modèle de trace interne. Les valeurs métier viennent uniquement des façades de domaine ; l'outil ne calcule rien.
 */
public abstract class OutilLecture {

    private static final Logger log = LoggerFactory.getLogger(OutilLecture.class);

    private final IAuditOutilsAgent audit;

    protected OutilLecture(IAuditOutilsAgent audit) {
        this.audit = audit;
    }

    /** Ce que l'outil renvoie : données structurées, phrase de synthèse, volume et périmètre borné pour le journal. */
    protected record Resultat(Map<String, Object> donnees, String synthese, int nombreElements,
                              Map<String, Object> perimetreAudit) {
    }

    /** Argument refusé par l'outil, avec un message destiné au modèle (aucune valeur saisie n'y est recopiée). */
    protected static final class ArgumentInvalide extends RuntimeException {
        ArgumentInvalide(String message) {
            super(message);
        }
    }

    protected abstract String nom();

    protected abstract String description();

    /** Permissions toutes requises, en plus de {@code IA_UTILISER} déjà exigée par la route. */
    protected abstract Set<String> permissions();

    protected abstract Map<String, Object> proprietesEntree();

    protected abstract Map<String, Object> schemaSortie();

    protected abstract Resultat executer(Authentication lecteur, Arguments arguments);

    public McpStatelessServerFeatures.SyncToolSpecification specification() {
        Map<String, Object> entree = Map.of("type", "object", "properties", proprietesEntree(), "additionalProperties", false);
        McpSchema.Tool outil = McpSchema.Tool.builder(nom(), entree)
                .description(description())
                .outputSchema(schemaSortie())
                .annotations(new McpSchema.ToolAnnotations(null, true, false, true, false, null))
                .build();
        return new McpStatelessServerFeatures.SyncToolSpecification(outil, (contexte, requete) -> appeler(contexte, requete));
    }

    private McpSchema.CallToolResult appeler(McpTransportContext contexte, McpSchema.CallToolRequest requete) {
        if (!(contexte.get(McpServeurConfig.CONTEXTE_AUTHENTIFICATION) instanceof Authentication lecteur)) {
            return erreur("Identité indisponible.");
        }
        Set<String> autorites = lecteur.getAuthorities().stream().map(GrantedAuthority::getAuthority)
                .collect(Collectors.toSet());
        List<String> manquantes = permissions().stream().filter(p -> !autorites.contains(p)).sorted().toList();
        if (!manquantes.isEmpty()) {
            audit.lectureRefusee(nom(), "PERMISSION_MANQUANTE");
            return erreur("Accès refusé : permission " + String.join(", ", manquantes) + " requise pour " + nom() + ".");
        }
        Resultat resultat;
        try {
            resultat = executer(lecteur, new Arguments(requete.arguments()));
        } catch (ArgumentInvalide invalide) {
            audit.lectureRefusee(nom(), "ARGUMENT_INVALIDE");
            return erreur(invalide.getMessage());
        } catch (RuntimeException panne) {
            log.error("Outil MCP {} en échec", nom(), panne);
            audit.lectureRefusee(nom(), "ERREUR_INTERNE");
            return erreur("L'outil " + nom() + " n'a pas pu répondre.");
        }
        audit.lectureServie(nom(), resultat.nombreElements(), resultat.perimetreAudit());
        return McpSchema.CallToolResult.builder()
                .isError(false)
                .structuredContent(resultat.donnees())
                .addTextContent(resultat.synthese())
                .build();
    }

    private static McpSchema.CallToolResult erreur(String message) {
        return McpSchema.CallToolResult.builder().isError(true).addTextContent(message).build();
    }

    // --- fragments de schéma ---

    protected static Map<String, Object> periode() {
        return Map.of("type", "string", "pattern", "^\\d{4}-(0[1-9]|1[0-2])$",
                "description", "Mois aaaa-MM ; absent = dernier mois de paie importé");
    }

    protected static Map<String, Object> identifiants(String description) {
        return Map.of("type", "array", "items", Map.of("type", "integer", "minimum", 0), "maxItems", 50,
                "description", description);
    }

    protected static Map<String, Object> objet(Map<String, Object> proprietes, List<String> requis) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", proprietes);
        schema.put("required", requis);
        return schema;
    }

    protected static Map<String, Object> vueProposee() {
        return objet(Map.of("module", Map.of("type", "string"), "vue", Map.of("type", "string"),
                "parametres", Map.of("type", "object")), List.of("module", "vue", "parametres"));
    }

    protected static ArgumentInvalide invalide(String message) {
        return new ArgumentInvalide(message);
    }
}
