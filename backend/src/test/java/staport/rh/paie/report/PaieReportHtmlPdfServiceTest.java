package staport.rh.paie.report;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.equipe.entities.Equipe;
import staport.rh.function.entities.Function;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.repositories.PaieRepository;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Vérifie que le pipeline HTML/CSS (jsoup → openhtmltopdf, voir {@link PaieReportHtmlPdfService})
 * produit réellement un PDF de bout en bout — pas seulement que {@link PaieBiReportBuilder} calcule
 * la bonne vue-modèle (voir {@code PaieBiReportBuilderTest}). Remplace l'ancien
 * {@code PaieReportPdfServiceTest} (JasperReports, supprimé) : les 2 premiers tests reprennent les
 * mêmes scénarios (PDF valide "au repos", puis le chemin le plus à risque — chantier avec équipes
 * détaillées + squelette matériel) ; le 3e est un test de non-régression dédié à l'incident de
 * production qui avait fait abandonner un premier pipeline HTML pour ce même rapport (voir le
 * Javadoc de {@link PaieReportHtmlBuilder}).
 */
@ExtendWith(MockitoExtension.class)
class PaieReportHtmlPdfServiceTest {

    @Mock
    private PaieRepository repository;

    private PaieReportHtmlPdfService service;

    private static final PaieReportPdfRequestDto REQUETE_SANS_FILTRE =
            new PaieReportPdfRequestDto("2026-09", null, null, null, null, null);

    @BeforeEach
    void setUp() {
        RapportRessourcesStatiques ressources = new RapportRessourcesStatiques();
        RapportChartSvgBuilder chartSvgBuilder = new RapportChartSvgBuilder();
        PaieBiReportBuilder biReportBuilder = new PaieBiReportBuilder(repository);
        RapportPageModelBuilder pageModelBuilder = new RapportPageModelBuilder();
        PaieReportHtmlBuilder htmlBuilder = new PaieReportHtmlBuilder(ressources, chartSvgBuilder);
        service = new PaieReportHtmlPdfService(ressources, biReportBuilder, pageModelBuilder, htmlBuilder);
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
     * section "reste", tableaux récap Fonction/Effectif/STC et parc matériel C168/CH/OP). */
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

    /** Non-régression de l'incident de production historique #1 (2026-09-25, ancien pipeline HTML
     * pré-JasperReports, voir le Javadoc de {@link PaieReportHtmlBuilder}) : une observation
     * contenant littéralement des balises ({@code </style><script>...}, {@code <tr><td>...})
     * injectée sans échappement avait cassé le parseur XML strict d'openhtmltopdf
     * ({@code SAXParseException}, génération en échec). {@link PaieReportHtmlBuilder} construit le
     * DOM par programmation (jsoup {@code Element.text(...)}, toujours échappé) — cette charge
     * hostile doit donc réapparaître comme simple TEXTE VISIBLE dans le PDF, jamais interprétée, et
     * la génération ne doit jamais échouer. */
    @Test
    void generer_neDoitJamaisInterpreterUneChargeHostileCommeDuMarkup() throws IOException {
        String chargeHostile = "</style><script>alert(1)</script><tr><td>injection</td></tr>";
        Paie paieHostile = paie("EMPLOYE </style><tr>", "CIN1", "MACON", "C059", "EQUIPE A", "5000", chargeHostile);

        when(repository.findAll(any(Specification.class))).thenReturn(List.of(paieHostile), List.of());

        byte[] pdf = service.generer(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE);

        assertThat(pdf).isNotEmpty();
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");

        String texte;
        try (PDDocument document = PDDocument.load(pdf)) {
            texte = new PDFTextStripper().getText(document);
        }
        // La charge apparaît intacte comme texte VISIBLE de la colonne Obs — la preuve qu'elle a été
        // échappée (jsoup Element.text(...)) puis simplement imprimée telle quelle, jamais
        // interprétée comme balise par le parseur XML strict d'openhtmltopdf (ce qui, avec l'ancien
        // pipeline non échappé, cassait entièrement la génération — SAXParseException).
        assertThat(texte).contains(chargeHostile);
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
        paie.setEquipe(equipe == null ? null : equipe(equipe));
        paie.setNombreJoursTravailles(26);
        paie.setSalaireMensuel(new BigDecimal(salaireTotal));
        paie.setSalaireTotal(new BigDecimal(salaireTotal));
        paie.setObservation(observation);
        return paie;
    }

    private Equipe equipe(String code) {
        Equipe equipe = new Equipe();
        equipe.setCode(code);
        equipe.setLibelle(code);
        return equipe;
    }
}
