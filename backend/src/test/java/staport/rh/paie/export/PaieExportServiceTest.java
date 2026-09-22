package staport.rh.paie.export;

import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.function.entities.Function;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.repositories.PaieRepository;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaieExportServiceTest {

    @Mock
    private PaieRepository repository;

    @InjectMocks
    private PaieExportService exportService;

    @Test
    void exporter_devraitGenererUneFeuilleGlobaleEtUneFeuilleParChantier() throws IOException {
        YearMonth periode = YearMonth.of(2026, 8);
        Paie paieAout = construirePaie("BOULJIHEL SALH", "PB85747", "OPERATEUR", "C059", "EQUIPE A");
        Paie paieJuillet = construirePaie("BOULJIHEL SALH", "PB85747", "OPERATEUR", "C059", "EQUIPE A");

        when(repository.findByPeriode(periode)).thenReturn(List.of(paieAout));
        when(repository.findByPeriode(periode.minusMonths(1))).thenReturn(List.of(paieJuillet));

        ByteArrayInputStream resultat = exportService.exporter(periode, List.of("C059"));

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
        paie.calculerSalaireTotal();
        return paie;
    }
}
