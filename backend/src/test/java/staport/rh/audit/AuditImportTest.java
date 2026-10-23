package staport.rh.audit;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;
import staport.rh.employee.imports.EmployeeImportResultDto;
import staport.rh.employee.imports.EmployeeImportService;
import staport.rh.function.imports.FunctionImportResultDto;
import staport.rh.function.imports.FunctionImportService;
import staport.rh.equipe.imports.EquipeImportResultDto;
import staport.rh.equipe.imports.EquipeImportService;
import staport.rh.employee.entities.TypeSalaire;
import staport.rh.paie.imports.PaieImportAnalyseDto;
import staport.rh.paie.imports.PaieImportCorrectionsDto;
import staport.rh.paie.imports.PaieImportDepartsDto;
import staport.rh.paie.imports.PaieImportException;
import staport.rh.paie.imports.PaieImportResultDto;
import staport.rh.paie.imports.PaieImportService;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.YearMonth;
import java.time.LocalDate;
import java.sql.Date;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Scénarios S2 et S3 : un import réussi, un import refusé, et les corrections de l'assistant — sur la vraie chaîne. */
class AuditImportTest extends AuditIntegrationTestBase {

    @Autowired
    private PaieImportService importService;

    @Autowired
    private EmployeeImportService employeeImportService;

    @Autowired
    private FunctionImportService functionImportService;

    @Autowired
    private EquipeImportService equipeImportService;

    /** Fichier de paie au format attendu : trois lignes d'en-tête, puis une ligne par bulletin. */
    private static MockMultipartFile fichier(String nomPrenom, String cin, String fonction, String chantierCode) throws IOException {
        try (XSSFWorkbook classeur = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            Sheet feuille = classeur.createSheet("Paie");
            feuille.createRow(0);
            feuille.createRow(1);
            feuille.createRow(2);
            Row ligne = feuille.createRow(3);
            ligne.createCell(0).setCellValue(nomPrenom);
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

    private static MockMultipartFile fichierEmploye(String nomPrenom, String cin, String fonction, String chantierCode) throws IOException {
        try (XSSFWorkbook classeur = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            Sheet feuille = classeur.createSheet("Employés");
            Row entete = feuille.createRow(0);
            for (int colonne = 0; colonne < 6; colonne++) {
                entete.createCell(colonne).setCellValue("Colonne " + colonne);
            }
            Row ligne = feuille.createRow(1);
            ligne.createCell(0).setCellValue(Date.valueOf(LocalDate.of(2020, 1, 1)));
            ligne.createCell(1).setCellValue(nomPrenom);
            ligne.createCell(2).setCellValue(cin);
            ligne.createCell(3).setCellValue(fonction);
            ligne.createCell(4).setCellValue(chantierCode);
            ligne.createCell(5).setCellValue(Date.valueOf(LocalDate.of(1990, 1, 1)));
            classeur.write(sortie);
            return new MockMultipartFile("file", "employes-test.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sortie.toByteArray());
        }
    }

    private static MockMultipartFile fichierFonctions(String libelle) throws IOException {
        try (XSSFWorkbook classeur = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            Sheet feuille = classeur.createSheet("Fonctions");
            feuille.createRow(0).createCell(0).setCellValue("Fonction");
            feuille.createRow(1).createCell(0).setCellValue(libelle);
            classeur.write(sortie);
            return new MockMultipartFile("file", "fonctions-test.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sortie.toByteArray());
        }
    }

    private static MockMultipartFile fichierEquipes(String code, String libelle) throws IOException {
        try (XSSFWorkbook classeur = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            Sheet feuille = classeur.createSheet("Équipes");
            Row entete = feuille.createRow(0);
            entete.createCell(0).setCellValue("Code");
            entete.createCell(1).setCellValue("Libellé");
            Row ligne = feuille.createRow(1);
            ligne.createCell(0).setCellValue(code);
            ligne.createCell(1).setCellValue(libelle);
            classeur.write(sortie);
            return new MockMultipartFile("file", "equipes-test.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sortie.toByteArray());
        }
    }

    /** La paie s'importe mois après mois : le mois qui suit le dernier présent dans la base partagée. */
    private YearMonth moisSuivant() {
        Integer dernier = jdbc.queryForObject("SELECT max(periode) FROM paie", Integer.class);
        return dernier == null ? YearMonth.of(2032, 1) : YearMonth.of(dernier / 100, dernier % 100).plusMonths(1);
    }

    /** La fiche du référentiel de test, avec le salaire de la ligne du fichier : le fichier concorde avec elle. */
    private void aligner(Referentiel ref) {
        jdbc.update("UPDATE employe SET salaire = 3000, type_salaire = 'MENSUEL', equipe_id = NULL WHERE id = ?", ref.employeId());
    }

    @Test
    void un_import_reussi_laisse_une_seule_entree_avec_l_empreinte_du_fichier_et_toutes_les_lignes_dans_sa_revision() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        aligner(ref);
        YearMonth mois = moisSuivant();
        MockMultipartFile fichier = fichier("Nom " + ref.suffixe(), "CIN" + ref.suffixe(), "F-" + ref.suffixe(), "C-" + ref.suffixe());

        PaieImportResultDto resultat = importService.importer(fichier, mois, new PaieImportDepartsDto(null));

        assertThat(resultat.crees()).isEqualTo(1);
        Map<String, Object> entree = jdbc.queryForMap("SELECT * FROM audit_journal WHERE action = 'PAIE_IMPORT' ORDER BY id DESC LIMIT 1");
        assertThat(entree.get("resultat")).isEqualTo("SUCCES");
        assertThat(((Number) entree.get("nombre_elements")).intValue()).isEqualTo(1);
        String perimetre = entree.get("perimetre").toString();
        assertThat(perimetre).contains("paie-test.xlsx").contains(mois.toString()).contains("fichierSha256");
        assertThat(perimetre).as("jamais le contenu du fichier").doesNotContain(ref.suffixe());
        assertThat(lignesAud("paie_aud", revisionDe(entree), (short) 0)).isEqualTo(1);
    }

    @Test
    void un_fichier_pas_pret_est_refuse_et_trace_comme_echec_sans_rien_enregistrer() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        YearMonth mois = moisSuivant();
        long avant = jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM audit_journal", Long.class);

        assertThatThrownBy(() -> importService.importer(fichier("Nom", "CIN-INCONNU-" + ref.suffixe(), "F", "C-" + ref.suffixe()),
                mois, new PaieImportDepartsDto(null))).isInstanceOf(PaieImportException.class);

        Map<String, Object> entree = jdbc.queryForMap("SELECT * FROM audit_journal WHERE id > ? AND action = 'PAIE_IMPORT'", avant);
        assertThat(entree.get("resultat")).isEqualTo("ECHEC");
        assertThat(entree.get("revision_id")).isNull();
        assertThat(entree.get("perimetre").toString()).contains("fichierSha256");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM paie WHERE periode = ?", Long.class,
                mois.getYear() * 100 + mois.getMonthValue())).isZero();
    }

    @Test
    void les_corrections_de_l_assistant_alignent_la_fiche_en_une_entree_dont_la_revision_garde_la_nouvelle_version() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        MockMultipartFile fichier = fichier("Nom " + ref.suffixe(), "CIN" + ref.suffixe(), "F-" + ref.suffixe(), "C-" + ref.suffixe());

        PaieImportAnalyseDto apres = importService.corriger(fichier, moisSuivant(), new PaieImportCorrectionsDto(
                List.of(new PaieImportCorrectionsDto.Alignement(ref.employeId(), TypeSalaire.MENSUEL)), null));

        assertThat(apres.pret()).isTrue();
        Map<String, Object> entree = uneEntree("PAIE_IMPORT_CORRECTION", null);
        assertThat(entree.get("resultat")).isEqualTo("SUCCES");
        assertThat(entree.get("perimetre").toString()).contains("\"fichesAlignees\": 1");
        assertThat(jdbc.queryForObject("SELECT type_salaire FROM employe_aud WHERE id = ? AND rev = ? AND revtype = 1", String.class,
                ref.employeId(), revisionDe(entree))).isEqualTo("MENSUEL");
    }

    @Test
    void un_import_employe_reussi_est_audite_sans_exposer_les_donnees_personnelles() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        String nom = "Employé " + ref.suffixe();
        String cin = "CIN-IMPORT-" + ref.suffixe();
        long avant = jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM audit_journal", Long.class);

        EmployeeImportResultDto resultat = employeeImportService.importer(
                fichierEmploye(nom, cin, "F-" + ref.suffixe(), "C-" + ref.suffixe()));

        assertThat(resultat.crees()).isEqualTo(1);
        Map<String, Object> entree = jdbc.queryForMap(
                "SELECT * FROM audit_journal WHERE id > ? AND action = 'EMPLOYE_IMPORT'", avant);
        assertThat(entree.get("resultat")).isEqualTo("SUCCES");
        assertThat(entree.get("nombre_elements")).isEqualTo(1);
        assertThat(entree.get("perimetre").toString()).contains("employes-test.xlsx", "fichierSha256")
                .doesNotContain(nom, cin);
        long revision = revisionDe(entree);
        assertThat(lignesAud("employe_aud", revision, (short) 0)).isEqualTo(1);
    }

    @Test
    void un_import_employe_rejete_est_audite_en_echec_sans_creer_de_ligne() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        long avant = jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM audit_journal", Long.class);

        EmployeeImportResultDto resultat = employeeImportService.importer(fichierEmploye(
                "Autre nom", "cin" + ref.suffixe().toLowerCase(), "F-" + ref.suffixe(), "C-" + ref.suffixe()));

        assertThat(resultat.crees()).isZero();
        assertThat(resultat.ignores()).isEqualTo(1);
        Map<String, Object> entree = jdbc.queryForMap(
                "SELECT * FROM audit_journal WHERE id > ? AND action = 'EMPLOYE_IMPORT'", avant);
        assertThat(entree.get("resultat")).isEqualTo("ECHEC");
        assertThat(entree.get("motif")).isEqualTo("1 ligne(s) rejetée(s) sur 1");
        assertThat(entree.get("revision_id")).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM employe WHERE nom_prenom = 'Autre nom'", Long.class)).isZero();
    }

    @Test
    void un_import_fonction_reussi_est_lie_a_sa_revision() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        String libelle = "F-IMPORT-" + ref.suffixe();
        long avant = jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM audit_journal", Long.class);

        FunctionImportResultDto resultat = functionImportService.importer(fichierFonctions(libelle));

        assertThat(resultat.crees()).isEqualTo(1);
        Map<String, Object> entree = jdbc.queryForMap(
                "SELECT * FROM audit_journal WHERE id > ? AND action = 'FONCTION_IMPORT'", avant);
        assertThat(entree.get("resultat")).isEqualTo("SUCCES");
        assertThat(entree.get("nombre_elements")).isEqualTo(1);
        long revision = revisionDe(entree);
        assertThat(lignesAud("fonction_aud", revision, (short) 0)).isEqualTo(1);
    }

    @Test
    void un_import_fonction_rejete_est_audite_en_echec() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        long avant = jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM audit_journal", Long.class);

        FunctionImportResultDto resultat = functionImportService.importer(fichierFonctions("F-" + ref.suffixe()));

        assertThat(resultat.crees()).isZero();
        assertThat(resultat.ignores()).isEqualTo(1);
        Map<String, Object> entree = jdbc.queryForMap(
                "SELECT * FROM audit_journal WHERE id > ? AND action = 'FONCTION_IMPORT'", avant);
        assertThat(entree.get("resultat")).isEqualTo("ECHEC");
        assertThat(entree.get("revision_id")).isNull();
        assertThat(entree.get("motif")).isEqualTo("1 ligne(s) rejetée(s) sur 1");
    }

    @Test
    void un_import_equipe_reussi_est_audite_sans_conserver_le_contenu_du_fichier() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        String code = "EQ" + ref.suffixe();
        long avant = jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM audit_journal", Long.class);

        EquipeImportResultDto resultat = equipeImportService.importer(fichierEquipes(code, "Equipe import " + ref.suffixe()));

        assertThat(resultat.crees()).isEqualTo(1);
        Map<String, Object> entree = jdbc.queryForMap(
                "SELECT * FROM audit_journal WHERE id > ? AND action = 'EQUIPE_IMPORT'", avant);
        assertThat(entree.get("resultat")).isEqualTo("SUCCES");
        assertThat(entree.get("nombre_elements")).isEqualTo(1);
        assertThat(entree.get("perimetre").toString()).contains("equipes-test.xlsx").contains("fichierSha256")
                .doesNotContain(code).doesNotContain("Equipe import");
        assertThat(lignesAud("equipe_aud", revisionDe(entree), (short) 0)).isEqualTo(1);
    }
}
