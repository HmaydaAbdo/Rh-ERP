package staport.rh.paie.export;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.function.entities.Function;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.repositories.PaieRepository;
import staport.rh.paie.reporting.FeuillesEquipeMode;
import staport.rh.paie.reporting.PaiePerimetreService;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaieExportServiceTest {

    @Mock
    private PaieRepository repository;

    private PaieExportService exportService;

    @BeforeEach
    void setUp() {
        exportService = new PaieExportService(new PaiePerimetreService(repository));
    }

    private static PaieExportRequestDto requeteToutesEquipes(String periode) {
        return new PaieExportRequestDto(periode, FeuillesEquipeMode.TOUTES, null, null, null);
    }

    private static PaieExportRequestDto requeteAucuneEquipe(String periode) {
        return new PaieExportRequestDto(periode, FeuillesEquipeMode.AUCUNE, null, null, null);
    }

    @Test
    void exporter_devraitGenererUneFeuilleGlobaleEtUneFeuilleParChantier() throws IOException {
        YearMonth periode = YearMonth.of(2026, 8);
        Paie paieAout = construirePaie("BOULJIHEL SALH", "PB85747", "OPERATEUR", "C059", "EQUIPE A");
        Paie paieJuillet = construirePaie("BOULJIHEL SALH", "PB85747", "OPERATEUR", "C059", "EQUIPE A");

        when(repository.findByPeriode(periode)).thenReturn(List.of(paieAout));
        when(repository.findByPeriode(periode.minusMonths(1))).thenReturn(List.of(paieJuillet));

        ByteArrayInputStream resultat = exportService.exporter(periode, requeteToutesEquipes(periode.toString()));

        try (Workbook workbook = new XSSFWorkbook(resultat)) {
            assertThat(workbook.getSheet("GLB")).isNotNull();
            Sheet feuilleChantier = workbook.getSheet("C059");
            assertThat(feuilleChantier).isNotNull();
            assertThat(workbook.getSheet("C059_EQUIPE A")).isNotNull();

            // Ligne "TOTAL GENERAL MOIS PRECEDENT" doit refléter le total de juillet (5000), pas 0.
            double totalMoisPrecedent = feuilleChantier.getRow(6).getCell(9).getNumericCellValue();
            assertThat(totalMoisPrecedent).isEqualTo(5000.0);
        }
    }

    @Test
    void exporter_devraitAfficherIntrouvableSiAucunePaieMoisPrecedentPourLeChantier() throws IOException {
        YearMonth periode = YearMonth.of(2026, 8);
        Paie paieAout = construirePaie("BOULJIHEL SALH", "PB85747", "OPERATEUR", "C059", "EQUIPE A");

        when(repository.findByPeriode(periode)).thenReturn(List.of(paieAout));
        when(repository.findByPeriode(periode.minusMonths(1))).thenReturn(List.of());

        ByteArrayInputStream resultat = exportService.exporter(periode, requeteAucuneEquipe(periode.toString()));

        try (Workbook workbook = new XSSFWorkbook(resultat)) {
            Sheet feuilleChantier = workbook.getSheet("C059");
            String totalMoisPrecedent = feuilleChantier.getRow(6).getCell(9).getStringCellValue();
            assertThat(totalMoisPrecedent).isEqualTo("INTROUVABLE");
        }
    }

    @Test
    void exporter_devraitCompterLesSortiesStcParFonction() throws IOException {
        YearMonth periode = YearMonth.of(2026, 8);
        Paie sortieStc = construirePaie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A");
        sortieStc.setObservation("STC");
        Paie sortieMinuscule = construirePaie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", "EQUIPE A");
        sortieMinuscule.setObservation("sortie");
        Paie actif = construirePaie("EMPLOYE TROIS", "CIN3", "OPERATEUR", "C059", "EQUIPE A");
        actif.setObservation("RAS");

        when(repository.findByPeriode(periode)).thenReturn(List.of(sortieStc, sortieMinuscule, actif));
        when(repository.findByPeriode(periode.minusMonths(1))).thenReturn(List.of());

        ByteArrayInputStream resultat = exportService.exporter(periode, requeteAucuneEquipe(periode.toString()));

        try (Workbook workbook = new XSSFWorkbook(resultat)) {
            Sheet feuilleGlobale = workbook.getSheet("GLB");
            // Table "effectif par fonction" : en-tête à la ligne 10, donnée OPERATEUR à la ligne 11
            // (4 lignes d'en-tête + 3 lignes employé + 2 lignes de total + 1 ligne vide, voir PaieSheetWriter).
            assertThat(feuilleGlobale.getRow(10).getCell(0).getStringCellValue()).isEqualTo("FONCTION");
            assertThat(feuilleGlobale.getRow(10).getCell(1).getStringCellValue()).isEqualTo("EFFECTIF");
            assertThat(feuilleGlobale.getRow(10).getCell(2).getStringCellValue()).isEqualTo("STC");

            assertThat(feuilleGlobale.getRow(11).getCell(0).getStringCellValue()).isEqualTo("OPERATEUR");
            assertThat(feuilleGlobale.getRow(11).getCell(1).getNumericCellValue()).isEqualTo(3.0);
            assertThat(feuilleGlobale.getRow(11).getCell(2).getNumericCellValue()).isEqualTo(2.0);
        }
    }

    @Test
    void exporter_devraitAjouterLeSqueletteCamionPourChantierC168EquipeCh() throws IOException {
        YearMonth periode = YearMonth.of(2026, 8);
        Paie paie = construirePaie("EMPLOYE UN", "CIN1", "OPERATEUR", "C168", "CH");

        when(repository.findByPeriode(periode)).thenReturn(List.of(paie));
        when(repository.findByPeriode(periode.minusMonths(1))).thenReturn(List.of());

        ByteArrayInputStream resultat = exportService.exporter(periode, requeteToutesEquipes(periode.toString()));

        try (Workbook workbook = new XSSFWorkbook(resultat)) {
            Sheet feuilleEquipe = workbook.getSheet("C168_CH");
            assertThat(feuilleEquipe).isNotNull();

            // Squelette placé sur les mêmes lignes que le tableau effectif (en-tête ligne 8 pour 1
            // employé), colonnes 6/7 (3 colonnes vides après effectif qui occupe les colonnes 0-2).
            assertThat(feuilleEquipe.getRow(8).getCell(6).getStringCellValue()).isEqualTo("CAMION");
            assertThat(feuilleEquipe.getRow(8).getCell(7).getStringCellValue()).isEqualTo("Nbre");

            String[] libellesAttendus = {"CAMION CITERNE", "CAMION 8*4", "CAMION SR", "PORT CHAR", "PICK UP"};
            for (int i = 0; i < libellesAttendus.length; i++) {
                int ligne = 9 + i;
                assertThat(feuilleEquipe.getRow(ligne).getCell(6).getStringCellValue()).isEqualTo(libellesAttendus[i]);
                Cell celluleNbre = feuilleEquipe.getRow(ligne).getCell(7);
                assertThat(celluleNbre.getCellType()).isEqualTo(CellType.BLANK);
            }
        }
    }

    @Test
    void exporter_devraitAjouterLeSqueletteEnginsPourChantierC168EquipeOp() throws IOException {
        YearMonth periode = YearMonth.of(2026, 8);
        Paie paie = construirePaie("EMPLOYE UN", "CIN1", "OPERATEUR", "C168", "OP");

        when(repository.findByPeriode(periode)).thenReturn(List.of(paie));
        when(repository.findByPeriode(periode.minusMonths(1))).thenReturn(List.of());

        ByteArrayInputStream resultat = exportService.exporter(periode, requeteToutesEquipes(periode.toString()));

        try (Workbook workbook = new XSSFWorkbook(resultat)) {
            Sheet feuilleEquipe = workbook.getSheet("C168_OP");
            assertThat(feuilleEquipe).isNotNull();
            assertThat(feuilleEquipe.getRow(8).getCell(6).getStringCellValue()).isEqualTo("ENGINS");

            String[] libellesAttendus = {"PELLE PNEU", "PELLE CHENILLE", "NIVELEUSE", "COMPACTEURS",
                    "CHARGEUR", "BULL", "TRACTOPELLE"};
            for (int i = 0; i < libellesAttendus.length; i++) {
                assertThat(feuilleEquipe.getRow(9 + i).getCell(6).getStringCellValue()).isEqualTo(libellesAttendus[i]);
            }
        }
    }

    @Test
    void exporter_neDevraitPasAjouterDeSquelettePourUnAutreChantierOuUneAutreEquipe() throws IOException {
        YearMonth periode = YearMonth.of(2026, 8);
        Paie paieAutreChantier = construirePaie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "CH");
        Paie paieAutreEquipe = construirePaie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C168", "EQUIPE A");

        when(repository.findByPeriode(periode)).thenReturn(List.of(paieAutreChantier, paieAutreEquipe));
        when(repository.findByPeriode(periode.minusMonths(1))).thenReturn(List.of());

        ByteArrayInputStream resultat = exportService.exporter(periode, requeteToutesEquipes(periode.toString()));

        try (Workbook workbook = new XSSFWorkbook(resultat)) {
            Sheet feuilleAutreChantier = workbook.getSheet("C059_CH");
            assertThat(feuilleAutreChantier.getRow(8).getCell(6)).isNull();

            Sheet feuilleAutreEquipe = workbook.getSheet("C168_EQUIPE A");
            assertThat(feuilleAutreEquipe.getRow(8).getCell(6)).isNull();
        }
    }

    @Test
    void exporter_modePersonnalise_neDevraitGenererQueLesEquipesSelectionneesPourLeChantier() throws IOException {
        YearMonth periode = YearMonth.of(2026, 8);
        Paie paieEquipeA = construirePaie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A");
        Paie paieEquipeB = construirePaie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", "EQUIPE B");

        when(repository.findByPeriode(periode)).thenReturn(List.of(paieEquipeA, paieEquipeB));
        when(repository.findByPeriode(periode.minusMonths(1))).thenReturn(List.of());

        PaieExportRequestDto requete = new PaieExportRequestDto(periode.toString(),
                FeuillesEquipeMode.PERSONNALISE,
                Map.of("C059", List.of("EQUIPE A")),
                null,
                null);

        ByteArrayInputStream resultat = exportService.exporter(periode, requete);

        try (Workbook workbook = new XSSFWorkbook(resultat)) {
            assertThat(workbook.getSheet("C059_EQUIPE A")).isNotNull();
            assertThat(workbook.getSheet("C059_EQUIPE B")).isNull();
            // La feuille chantier elle-même n'est jamais filtrée par la sélection des sous-feuilles équipe.
            Sheet feuilleChantier = workbook.getSheet("C059");
            assertThat(feuilleChantier.getRow(4).getCell(0).getStringCellValue()).isEqualTo("EMPLOYE UN");
            assertThat(feuilleChantier.getRow(5).getCell(0).getStringCellValue()).isEqualTo("EMPLOYE DEUX");
        }
    }

    @Test
    void exporter_devraitExclureLesEquipesListeesDeLaFeuilleChantierSansToucherLaFeuilleGlb() throws IOException {
        YearMonth periode = YearMonth.of(2026, 8);
        Paie paieEquipeA = construirePaie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A");
        Paie paieEquipeB = construirePaie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", "EQUIPE B");

        when(repository.findByPeriode(periode)).thenReturn(List.of(paieEquipeA, paieEquipeB));
        when(repository.findByPeriode(periode.minusMonths(1))).thenReturn(List.of());

        PaieExportRequestDto requete = new PaieExportRequestDto(periode.toString(),
                FeuillesEquipeMode.AUCUNE,
                null,
                Map.of("C059", List.of("EQUIPE B")),
                null);

        ByteArrayInputStream resultat = exportService.exporter(periode, requete);

        try (Workbook workbook = new XSSFWorkbook(resultat)) {
            Sheet feuilleChantier = workbook.getSheet("C059");
            // Seule EQUIPE A reste (EQUIPE B exclue) : une ligne employé, puis "TOTAL GENERAL" juste après.
            assertThat(feuilleChantier.getRow(4).getCell(0).getStringCellValue()).isEqualTo("EMPLOYE UN");
            assertThat(feuilleChantier.getRow(5).getCell(3).getStringCellValue()).isEqualTo("TOTAL GENERAL");

            // La feuille GLB (tous chantiers) n'est jamais filtrée par cette exclusion : les deux lignes restent.
            Sheet feuilleGlobale = workbook.getSheet("GLB");
            assertThat(feuilleGlobale.getRow(4).getCell(0).getStringCellValue()).isEqualTo("EMPLOYE UN");
            assertThat(feuilleGlobale.getRow(5).getCell(0).getStringCellValue()).isEqualTo("EMPLOYE DEUX");
        }
    }

    @Test
    void exporter_devraitRestreindreLaFeuilleGlbAuxChantiersSelectionnes() throws IOException {
        YearMonth periode = YearMonth.of(2026, 8);
        Paie paieC059 = construirePaie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A");
        Paie paieC068 = construirePaie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C068", "EQUIPE A");

        when(repository.findByPeriode(periode)).thenReturn(List.of(paieC059, paieC068));
        when(repository.findByPeriode(periode.minusMonths(1))).thenReturn(List.of());

        PaieExportRequestDto requete = new PaieExportRequestDto(periode.toString(),
                FeuillesEquipeMode.AUCUNE, null, null, List.of("C068"));

        ByteArrayInputStream resultat = exportService.exporter(periode, requete);

        try (Workbook workbook = new XSSFWorkbook(resultat)) {
            assertThat(workbook.getSheet("C068")).isNotNull();
            assertThat(workbook.getSheet("C059")).isNull();

            // La feuille GLB, elle aussi, est restreinte au chantier sélectionné : un seul employé
            // (celui de C068), donc la ligne "TOTAL GENERAL" suit immédiatement.
            Sheet feuilleGlobale = workbook.getSheet("GLB");
            assertThat(feuilleGlobale.getRow(4).getCell(0).getStringCellValue()).isEqualTo("EMPLOYE DEUX");
            assertThat(feuilleGlobale.getRow(5).getCell(3).getStringCellValue()).isEqualTo("TOTAL GENERAL");
        }
    }

    private Paie construirePaie(String nomPrenom, String cin, String fonctionLibelle, String chantierCode,
                                 String equipe) {
        Employee employee = new Employee();
        employee.setNomPrenom(nomPrenom);
        employee.setCin(cin);

        Function fonction = new Function();
        fonction.setLibelle(fonctionLibelle);

        Chantier chantier = new Chantier();
        chantier.setCode(chantierCode);

        Paie paie = new Paie();
        paie.setEmployee(employee);
        paie.setFonction(fonction);
        paie.setChantier(chantier);
        paie.setEquipe(equipe);
        paie.setNombreJoursTravailles(26);
        paie.setSalaireMensuel(new BigDecimal("5000"));
        paie.setSalaireTotal(new BigDecimal("5000"));
        return paie;
    }
}
