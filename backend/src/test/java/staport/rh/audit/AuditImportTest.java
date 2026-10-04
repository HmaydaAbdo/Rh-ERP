package staport.rh.audit;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;
import staport.rh.paie.imports.PaieImportResultDto;
import staport.rh.paie.imports.PaieImportService;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.YearMonth;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Scénarios S2 et S3 : un import réussi, un import rejeté (qui ne lève pas d'exception) — sur la vraie chaîne. */
class AuditImportTest extends AuditIntegrationTestBase {

    @Autowired
    private PaieImportService importService;

    /** Fichier de paie au format attendu : trois lignes d'en-tête, puis une ligne par bulletin. */
    private static MockMultipartFile fichier(String cin, String fonction, String chantierCode) throws IOException {
        try (XSSFWorkbook classeur = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            Sheet feuille = classeur.createSheet("Paie");
            feuille.createRow(0);
            feuille.createRow(1);
            feuille.createRow(2);
            Row ligne = feuille.createRow(3);
            ligne.createCell(0).setCellValue("Nom Prénom");
            ligne.createCell(1).setCellValue(fonction);
            ligne.createCell(2).setCellValue(cin);
            ligne.createCell(3).setCellValue(26);
            ligne.createCell(6).setCellValue(3000);
            ligne.createCell(9).setCellValue(3000);
            ligne.createCell(11).setCellValue(chantierCode);
            classeur.write(sortie);
            return new MockMultipartFile("file", "paie-test.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sortie.toByteArray());
        }
    }

    @Test
    void un_import_reussi_laisse_une_seule_entree_avec_l_empreinte_du_fichier_et_toutes_les_lignes_dans_sa_revision() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        String nouvelleFonction = "FIMP-" + ref.suffixe();
        MockMultipartFile fichier = fichier("CIN" + ref.suffixe(), nouvelleFonction, "C-" + ref.suffixe());

        PaieImportResultDto resultat = importService.importer(fichier, YearMonth.of(2032, 1));

        assertThat(resultat.crees()).isEqualTo(1);
        assertThat(resultat.fonctionsCreees()).containsExactly(nouvelleFonction);
        Map<String, Object> entree = jdbc.queryForMap("SELECT * FROM audit_journal WHERE action = 'PAIE_IMPORT' ORDER BY id DESC LIMIT 1");
        assertThat(entree.get("resultat")).isEqualTo("SUCCES");
        assertThat(((Number) entree.get("nombre_elements")).intValue()).isEqualTo(1);
        String perimetre = entree.get("perimetre").toString();
        assertThat(perimetre).contains("paie-test.xlsx").contains("2032-01").contains("fichierSha256");
        assertThat(perimetre).as("jamais le contenu du fichier").doesNotContain(ref.suffixe());
        // La révision contient le bulletin ET la fonction créée au passage : une seule entrée, rien de perdu.
        long revision = revisionDe(entree);
        assertThat(lignesAud("paie_aud", revision, (short) 0)).isEqualTo(1);
        assertThat(lignesAud("fonction_aud", revision, (short) 0)).isEqualTo(1);
        Long fonctionId = jdbc.queryForObject("SELECT id FROM fonction WHERE libelle = ?", Long.class, nouvelleFonction);
        assertThat(entrees("FONCTION_CREATION", fonctionId)).as("action imbriquée : pas de seconde entrée").isEmpty();
    }

    @Test
    void un_import_rejete_est_trace_comme_echec_alors_que_le_service_ne_leve_aucune_exception() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        long avant = jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM audit_journal", Long.class);

        PaieImportResultDto resultat = importService.importer(fichier("CIN-INCONNU-" + ref.suffixe(), "F", "C-" + ref.suffixe()),
                YearMonth.of(2032, 2));

        assertThat(resultat.ignores()).isEqualTo(1);
        Map<String, Object> entree = jdbc.queryForMap("SELECT * FROM audit_journal WHERE id > ? AND action = 'PAIE_IMPORT'", avant);
        assertThat(entree.get("resultat")).isEqualTo("ECHEC");
        assertThat(entree.get("motif")).isEqualTo("1 ligne(s) rejetée(s) sur 1");
        assertThat(entree.get("revision_id")).isNull();
        assertThat(entree.get("perimetre").toString()).contains("fichierSha256");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM paie WHERE periode = 203202", Long.class)).isZero();
    }
}
