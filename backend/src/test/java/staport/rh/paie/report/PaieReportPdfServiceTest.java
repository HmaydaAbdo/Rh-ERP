package staport.rh.paie.report;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.function.entities.Function;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.repositories.PaieRepository;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Vérifie que le pipeline JasperReports produit réellement un PDF de bout en bout (compilation des
 * gabarits JRXML, remplissage, charts natifs, sous-rapports chantier/STC, export) — pas seulement
 * que {@link PaieBiReportBuilder} calcule la bonne vue-modèle (voir {@link PaieBiReportBuilderTest}).
 */
@ExtendWith(MockitoExtension.class)
class PaieReportPdfServiceTest {

    @Mock
    private PaieRepository repository;

    private PaieReportPdfService service;

    private static final PaieReportPdfRequestDto REQUETE_SANS_FILTRE =
            new PaieReportPdfRequestDto("2026-09", null, null, null, null, null);

    @BeforeEach
    void setUp() {
        service = new PaieReportPdfService(new PaieBiReportBuilder(repository));
    }

    @Test
    void generer_devraitProduireUnPdfValide() {
        Paie c059EquipeA = paie("EMPLOYE UN", "CIN1", "MACON", "C059", "EQUIPE A", "5000", null);
        Paie c059SansEquipe = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", null, "3000", "STC");
        Paie c068EquipeB = paie("EMPLOYE TROIS", "CIN3", "MACON", "C068", "EQUIPE B", "4000", null);
        Paie precedent = paie("EMPLOYE UN", "CIN1", "MACON", "C059", "EQUIPE A", "4500", null);

        @SuppressWarnings("unchecked")
        List<Paie> courant = List.of(c059EquipeA, c059SansEquipe, c068EquipeB);
        when(repository.findAll(any(Specification.class))).thenReturn(courant, List.of(precedent));

        byte[] pdf = service.generer(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE);

        assertThat(pdf).isNotEmpty();
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    }

    /** Exerce le chemin le plus à risque du gabarit (chantier avec équipe détaillée sélectionnée,
     * section "reste", sous-rapports récap Fonction/Effectif/STC et parc matériel C168/CH/OP) —
     * seule une génération de bout en bout via JasperReports peut révéler une erreur de compilation
     * ou de remplissage sur ces éléments (sous-rapports, bande à printWhenExpression). */
    @Test
    void generer_devraitProduireUnPdfValideAvecEquipeDetailleeEtSqueletteMateriel() {
        Paie c168Ch = paie("EMPLOYE UN", "CIN1", "CHAUFFEUR", "C168", "CH", "5000", null);
        Paie c168Op = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR ENGIN", "C168", "OP", "4500", null);
        Paie c168AutreEquipe = paie("EMPLOYE TROIS", "CIN3", "MACON", "C168", "EQUIPE X", "3000", null);

        @SuppressWarnings("unchecked")
        List<Paie> courant = List.of(c168Ch, c168Op, c168AutreEquipe);
        when(repository.findAll(any(Specification.class))).thenReturn(courant, List.of());

        PaieReportPdfRequestDto requeteAvecDetail = new PaieReportPdfRequestDto(
                "2026-09", null, null, null, null, Map.of("C168", List.of("CH", "OP")));

        byte[] pdf = service.generer(YearMonth.of(2026, 9), requeteAvecDetail);

        assertThat(pdf).isNotEmpty();
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    }

    private Paie paie(String nomPrenom, String cin, String fonctionLibelle, String chantierCode,
                       String equipe, String salaireTotal, String observation) {
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
        paie.setSalaireMensuel(new BigDecimal(salaireTotal));
        paie.setSalaireTotal(new BigDecimal(salaireTotal));
        paie.setObservation(observation);
        return paie;
    }
}
