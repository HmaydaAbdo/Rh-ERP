package staport.rh.audit.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import staport.rh.audit.context.ResolveurContexteAudit;
import staport.rh.audit.entities.AuditJournalEntry;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.ResultatAudit;
import staport.rh.audit.metrics.AuditMetrics;
import staport.rh.audit.services.interfaces.IAuditJournalWriter;
import staport.rh.audit.services.interfaces.IAuditOutilsAgent;
import tools.jackson.databind.json.JsonMapper;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class AuditOutilsAgent implements IAuditOutilsAgent {

    private static final Logger log = LoggerFactory.getLogger(AuditOutilsAgent.class);
    /** Même action qu'une consultation HTTP : le journal se lit de la même façon, l'outil est dans le périmètre. */
    private static final String ACTION_LECTURE = "LECTURE_METIER";

    private final IAuditJournalWriter ecrivain;
    private final AuditMetrics metriques;
    private final JsonMapper jsonMapper;

    public AuditOutilsAgent(IAuditJournalWriter ecrivain, AuditMetrics metriques, JsonMapper jsonMapper) {
        this.ecrivain = ecrivain;
        this.metriques = metriques;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public void lectureServie(String outil, int nombreElements, Map<String, Object> perimetre) {
        Map<String, Object> complet = new LinkedHashMap<>();
        complet.put("canal", "MCP");
        complet.put("outil", outil);
        complet.putAll(perimetre);
        AuditJournalEntry entree = AuditJournalWriter.entreePour(ResolveurContexteAudit.courant())
                .categorie(CategorieAudit.ACCES)
                .action(ACTION_LECTURE)
                .resultat(ResultatAudit.SUCCES)
                .nombreElements(nombreElements)
                .perimetre(jsonMapper.writeValueAsString(complet))
                .build();
        try {
            ecrivain.ecrireSeparement(entree);
        } catch (RuntimeException impossible) {
            // Même règle qu'une lecture HTTP : pas de donnée servie sans sa trace.
            metriques.ecritureEnEchec(CategorieAudit.ACCES);
            log.error("Lecture de l'outil {} non servie : sa trace d'audit n'a pas pu être écrite", outil, impossible);
            throw new IllegalStateException("La consultation ne peut pas être servie sans sa trace d'audit", impossible);
        }
    }

    @Override
    public void lectureRefusee(String outil, String motif) {
        try {
            ecrivain.ecrireSeparement(AuditJournalWriter.entreePour(ResolveurContexteAudit.courant())
                    .categorie(CategorieAudit.ACCES)
                    .action(ACTION_LECTURE)
                    .resultat(ResultatAudit.ECHEC)
                    .motif(motif)
                    .nombreElements(0)
                    .perimetre(jsonMapper.writeValueAsString(Map.of("canal", "MCP", "outil", outil)))
                    .build());
        } catch (RuntimeException impossible) {
            metriques.ecritureEnEchec(CategorieAudit.ACCES);
            log.error("Refus de l'outil {} non tracé", outil, impossible);
        }
    }
}
