package staport.rh.audit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;
import staport.rh.paie.exceptions.AucunePaiePeriodeException;
import staport.rh.paie.export.PaieExportRequestDto;
import staport.rh.paie.export.PaieExportService;
import staport.rh.paie.report.PaieReportHtmlPdfService;
import staport.rh.paie.report.PaieReportPdfRequestDto;
import staport.rh.paie.reporting.FeuillesEquipeMode;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Scénario S24 : un export Excel ou un rapport PDF fait sortir la paie de l'application — il laisse une entrée ACCES. */
class AuditAccesTest extends AuditIntegrationTestBase {

    @Autowired
    private PaieExportService exportService;
    @Autowired
    private PaieReportHtmlPdfService rapportService;

    @Test
    void un_export_excel_laisse_une_entree_d_acces_avec_son_perimetre_et_aucun_contenu() {
        Referentiel ref = donnees.creerReferentiel();
        donnees.creerBulletin(ref, YearMonth.of(2033, 1));
        long avant = jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM audit_journal", Long.class);

        exportService.exporter(YearMonth.of(2033, 1),
                new PaieExportRequestDto("2033-01", FeuillesEquipeMode.AUCUNE, null, null, List.of("C-" + ref.suffixe()), null));

        Map<String, Object> entree = jdbc.queryForMap("SELECT * FROM audit_journal WHERE id > ? AND action = 'PAIE_EXPORT_EXCEL'", avant);
        assertThat(entree.get("categorie")).isEqualTo("ACCES");
        assertThat(entree.get("resultat")).isEqualTo("SUCCES");
        assertThat(entree.get("utilisateur_nom")).isEqualTo(UTILISATEUR_NOM);
        assertThat(entree.get("type_operation")).isNull();
        assertThat(entree.get("revision_id")).as("une lecture ne produit aucune révision").isNull();
        assertThat(entree.get("perimetre").toString()).contains("2033-01").contains("EXCEL").contains("C-" + ref.suffixe());
        assertThat(entree.get("perimetre").toString()).as("aucun contenu de la paie").doesNotContain("Nom " + ref.suffixe());
    }

    @Test
    void un_rapport_pdf_laisse_une_entree_d_acces_et_un_rapport_impossible_laisse_une_entree_d_echec() {
        Referentiel ref = donnees.creerReferentiel();
        donnees.creerBulletin(ref, YearMonth.of(2033, 2));
        long avant = jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM audit_journal", Long.class);

        // Hors de toute transaction, comme en production (open-in-view est désactivé) : le rapport charge ce qu'il lit.
        rapportService.generer(YearMonth.of(2033, 2), new PaieReportPdfRequestDto("2033-02", null, null, null, ref.chantierId(), null, null));
        assertThatThrownBy(() -> rapportService.generer(YearMonth.of(2033, 3), new PaieReportPdfRequestDto("2033-03", null, null, null, null, null, null)))
                .isInstanceOf(AucunePaiePeriodeException.class);

        List<Map<String, Object>> entrees = jdbc.queryForList("SELECT * FROM audit_journal WHERE id > ? AND action = 'PAIE_RAPPORT_PDF' ORDER BY id", avant);
        assertThat(entrees).hasSize(2);
        assertThat(entrees.get(0).get("resultat")).isEqualTo("SUCCES");
        assertThat(entrees.get(0).get("perimetre").toString()).contains("PDF").contains("2033-02");
        assertThat(entrees.get(1).get("resultat")).isEqualTo("ECHEC");
        assertThat(entrees.get(1).get("motif")).isEqualTo("AucunePaiePeriodeException");
    }
}
