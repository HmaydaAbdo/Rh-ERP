package staport.rh.mcp.outils;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import staport.rh.accueil.dtos.response.AccueilResponseDto;
import staport.rh.accueil.services.interfaces.IAccueilService;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.entities.CategorieAudit;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Outil {@code accueil_lire} : les indicateurs de l'écran d'accueil de l'utilisateur pour qui l'assistant agit. L'utilisateur
 * vient de l'authentification de l'appel, jamais d'un argument ; seuls les indicateurs que ses permissions autorisent sont rendus.
 * Lecture seule : l'assistant ne règle pas l'accueil.
 */
@Component
@ConditionalOnBooleanProperty("security.mcp.enabled")
public class OutilsAccueil {

    private final IAccueilService accueil;

    OutilsAccueil(IAccueilService accueil) {
        this.accueil = accueil;
    }

    @McpTool(name = "accueil_lire", title = "Accueil de l'utilisateur", generateOutputSchema = true,
            description = """
                    Rend les indicateurs affichés sur l'écran d'accueil de l'utilisateur pour qui tu agis (dans leur ordre) et ceux \
                    qu'il peut y ajouter, avec libellé et explication. À appeler quand l'utilisateur demande ce que contient son \
                    accueil ou quels indicateurs il peut y mettre. Les valeurs des indicateurs se lisent avec les outils paie_* et \
                    employes_*.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('ACCUEIL_READ')")
    @AuditableAction(action = "MCP_ACCUEIL_LIRE", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> accueilLire() {
        AccueilResponseDto reponse = accueil.lire(SecurityContextHolder.getContext().getAuthentication().getName());
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("personnalise", reponse.personnalise());
        donnees.put("indicateurs", reponse.indicateurs());
        donnees.put("disponibles", reponse.disponibles());
        return donnees;
    }
}
