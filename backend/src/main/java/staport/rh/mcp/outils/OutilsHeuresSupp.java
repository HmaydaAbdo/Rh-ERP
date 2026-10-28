package staport.rh.mcp.outils;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;
import staport.rh.heuresupp.dtos.response.HeureSuppResponseDto;
import staport.rh.heuresupp.dtos.response.HeuresSuppAnalytiqueDto;
import staport.rh.heuresupp.services.HeuresSuppAnalytiqueService;
import staport.rh.heuresupp.services.interfaces.IHeuresSuppService;

import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Outils de lecture du domaine Heures supplémentaires ; les montants proviennent toujours de Spring. */
@Component
@Validated
@ConditionalOnBooleanProperty("security.mcp.enabled")
public class OutilsHeuresSupp {

    private static final int LIGNES = 20;
    private final IHeuresSuppService heuresSupp;
    private final HeuresSuppAnalytiqueService analytique;

    OutilsHeuresSupp(IHeuresSuppService heuresSupp, HeuresSuppAnalytiqueService analytique) {
        this.heuresSupp = heuresSupp;
        this.analytique = analytique;
    }

    @McpTool(name = "heures_supp_periodes", title = "Mois des heures supplémentaires", generateOutputSchema = true,
            description = "Liste les mois ayant un import d'heures supplémentaires. Chaque ligne garde le mois de l'import ; "
                    + "une modification ultérieure du salaire ne recalcule pas les périodes déjà importées.",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true, openWorldHint = false))
    @PreAuthorize("hasAuthority('HEURES_SUP_READ') and hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_HEURES_SUP_PERIODES", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> periodes() {
        return enveloppe("/heures-supp/analytique", Map.of(), Map.of("periodes", analytique.periodes()));
    }

    @McpTool(name = "heures_supp_indicateurs", title = "Indicateurs d'heures supplémentaires", generateOutputSchema = true,
            description = "Rend pour un mois les effectifs, heures décimales, Montant, STC (DH), Forfaits et Net à payer, "
                    + "avec les répartitions par chantier, équipe et fonction. Les définitions sont incluses dans la réponse. "
                    + "Montant, STC et Net sont calculés par Spring ; ne les recalculez pas.",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true, openWorldHint = false))
    @PreAuthorize("hasAuthority('HEURES_SUP_READ') and hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_HEURES_SUP_INDICATEURS", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> indicateurs(
            @McpToolParam(required = false, description = "Mois au format aaaa-MM. Absent = dernier mois des heures supplémentaires importées.")
            @Pattern(regexp = Formats.PERIODE) String periode) {
        YearMonth mois = periode == null ? analytique.periodes().stream().findFirst().orElse(null) : YearMonth.parse(periode);
        if (mois == null) {
            return enveloppe("/heures-supp/analytique", Map.of(), Map.of("message", "Aucun mois d'heures supplémentaires n'a encore été importé."));
        }
        HeuresSuppAnalytiqueDto resultat = analytique.analyser(new HeuresSuppSearchCriteria(mois, null, null, null, null, null));
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("periode", resultat.periode());
        donnees.put("indicateurs", resultat.indicateurs());
        donnees.put("parChantier", resultat.parChantier().stream().limit(LIGNES).toList());
        donnees.put("parFonction", resultat.parFonction().stream().limit(LIGNES).toList());
        donnees.put("parEquipe", resultat.parEquipe().stream().limit(LIGNES).toList());
        donnees.put("definitions", resultat.definitions());
        return enveloppe("/heures-supp/analytique", Map.of("periode", mois.toString()), donnees);
    }

    @McpTool(name = "heures_supp_rechercher", title = "Rechercher des lignes d'heures supplémentaires", generateOutputSchema = true,
            description = "Recherche les lignes importées par mois, chantier, fonction, CIN partiel ou nom partiel. Au moins "
                    + "un critère est obligatoire. Rend au plus 20 lignes par page avec le salaire horaire, P/H, Montant, "
                    + "STC (DH), Forfait et Net à payer. Les montants et leur source sont calculés par Spring.",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true, openWorldHint = false))
    @PreAuthorize("hasAuthority('HEURES_SUP_READ') and hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_HEURES_SUP_RECHERCHER", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> rechercher(
            @McpToolParam(required = false, description = "Mois au format aaaa-MM.") @Pattern(regexp = Formats.PERIODE) String periode,
            @McpToolParam(required = false, description = "Identifiants des chantiers (maximum 50).") @Size(max = 50) List<@Min(1) Long> chantierIds,
            @McpToolParam(required = false, description = "Identifiants des équipes (maximum 50), 0 représente Sans équipe.") @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = "Identifiants des fonctions (maximum 50).") @Size(max = 50) List<@Min(1) Long> fonctionIds,
            @McpToolParam(required = false, description = "CIN partiel.") @Size(max = 30) String cin,
            @McpToolParam(required = false, description = "Nom et prénom partiels.") @Size(max = 150) String nomPrenom,
            @McpToolParam(required = false, description = "Page à partir de 0.") @Min(0) Integer page,
            @McpToolParam(required = false, description = "Nombre de lignes, de 1 à 20.") @Min(1) @Max(LIGNES) Integer limite) {
        if (periode == null && (chantierIds == null || chantierIds.isEmpty()) && (equipeIds == null || equipeIds.isEmpty()) && (fonctionIds == null || fonctionIds.isEmpty())
                && (cin == null || cin.isBlank()) && (nomPrenom == null || nomPrenom.isBlank())) {
            throw new IllegalArgumentException("Fournissez au moins un critère de recherche.");
        }
        YearMonth mois = periode == null ? null : YearMonth.parse(periode);
        HeuresSuppSearchCriteria criteres = new HeuresSuppSearchCriteria(mois,
                chantierIds == null ? null : chantierIds.stream().distinct().toList(),
                equipeIds == null ? null : equipeIds.stream().distinct().toList(),
                fonctionIds == null ? null : fonctionIds.stream().distinct().toList(), cin, nomPrenom);
        Page<HeureSuppResponseDto> resultat = heuresSupp.rechercher(criteres,
                PageRequest.of(page == null ? 0 : page, limite == null ? LIGNES : limite, Sort.by(Sort.Direction.DESC, "periode")));
        Map<String, Object> donnees = Map.of("content", resultat.getContent(), "page", resultat.getNumber(), "limite", resultat.getSize(), "total", resultat.getTotalElements());
        Map<String, Object> parametres = new LinkedHashMap<>();
        if (periode != null) parametres.put("periode", periode);
        if (chantierIds != null) parametres.put("chantierIds", chantierIds);
        if (equipeIds != null) parametres.put("equipeIds", equipeIds);
        if (fonctionIds != null) parametres.put("fonctionIds", fonctionIds);
        if (cin != null) parametres.put("cin", cin);
        if (nomPrenom != null) parametres.put("nomPrenom", nomPrenom);
        return enveloppe("/heures-supp", parametres, donnees);
    }

    private static Map<String, Object> enveloppe(String route, Map<String, Object> parametres, Map<String, Object> resultat) {
        return Map.of("vue", Map.of("route", route, "parametres", parametres), "resultats", resultat);
    }
}
