package staport.rh.paie.report;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.xml.sax.InputSource;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.function.entities.Function;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.exceptions.AucunePaiePeriodeException;
import staport.rh.paie.report.PaieReportPdfRequestDto.TypeRapport;
import staport.rh.paie.repositories.PaieRepository;
import staport.rh.paie.reporting.FeuillesEquipeMode;
import staport.rh.paie.reporting.PaiePerimetreService;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.io.StringReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaieReportPdfServiceTest {

    private static final YearMonth PERIODE = YearMonth.of(2026, 8);
    private static final String NBSP = "\u00A0";

    @Mock
    private PaieRepository repository;

    private PaieReportPdfService service;

    @BeforeEach
    void setUp() {
        PaieReportFontProvider fontProvider = new PaieReportFontProvider();
        // Le rapport a besoin d'une police Unicode installée (fonts-dejavu-core sur Linux) — sans elle,
        // ces tests sont ignorés plutôt qu'en échec (voir PaieReportFontProvider).
        try {
            fontProvider.resoudre();
        } catch (IllegalStateException e) {
            assumeTrue(false, "Aucune police système disponible : " + e.getMessage());
        }
        service = new PaieReportPdfService(
                new PaiePerimetreService(repository),
                new PaieReportViewModelBuilder(new PaieReportChartGenerator(fontProvider)),
                fontProvider);
    }

    private static PaieReportPdfRequestDto synthese() {
        return new PaieReportPdfRequestDto(PERIODE.toString(), TypeRapport.SYNTHESE, null, null, null);
    }

    private static PaieReportPdfRequestDto detaille(FeuillesEquipeMode mode) {
        return new PaieReportPdfRequestDto(PERIODE.toString(), TypeRapport.DETAILLE, mode, null, null);
    }

    private void donneesDeDemonstration() {
        List<Paie> aout = List.of(
                paie("BOULJIHEL SALAH", "PB85747", "OPERATEUR", "C059", "EQUIPE A", "5000", null),
                paie("ALAOUI YOUSSEF", "AB123456", "CHAUFFEUR", "C059", "EQUIPE B", "4200", "STC"),
                paie("BENNANI KARIM", "CD654321", "OPERATEUR", "C168", "OP", "5200", null),
                paie("IDRISSI SAMIRA", "EF112233", "CONDUCTEUR DE TRAVAUX", "C168", "CH", "9800", null),
                paie("TAZI OMAR", "GH445566", "OPERATEUR", "C171", "EQUIPE A", "4800", "sortie"));
        List<Paie> juillet = List.of(
                paie("BOULJIHEL SALAH", "PB85747", "OPERATEUR", "C059", "EQUIPE A", "4900", null),
                paie("BENNANI KARIM", "CD654321", "OPERATEUR", "C168", "OP", "5100", null));
        when(repository.findByPeriode(PERIODE)).thenReturn(aout);
        when(repository.findByPeriode(PERIODE.minusMonths(1))).thenReturn(juillet);
    }

    @Test
    void genererHtml_synthese_devraitContenirIndicateursEtRepartitionParChantier() {
        donneesDeDemonstration();

        String html = service.genererHtml(PERIODE, synthese());

        assertThat(html).contains("Août 2026");
        assertThat(html).contains("Synthèse exécutive");
        assertThat(html).contains("Répartition par chantier");
        assertThat(html).contains("C059", "C168", "C171");
        // 5000 + 4200 + 5200 + 9800 + 4800 = 29 000,00
        assertThat(html).contains("29" + NBSP + "000,00");
        // Les deux graphiques sont embarqués en PNG base64 (en-tête PNG "iVBORw0KGgo").
        assertThat(html).contains("data:image/png;base64,iVBORw0KGgo");
    }

    @Test
    void genererHtml_detaille_devraitContenirVueGlobaleChantiersEtEquipes() {
        donneesDeDemonstration();

        String html = service.genererHtml(PERIODE, detaille(FeuillesEquipeMode.TOUTES));

        assertThat(html).contains("Vue globale — tous chantiers");
        assertThat(html).contains("Chantier C059", "Chantier C168", "Chantier C171");
        assertThat(html).contains("C059 — Équipe EQUIPE A", "C168 — Équipe OP");
        assertThat(html).contains("BOULJIHEL SALAH");
    }

    @Test
    void genererHtml_detaille_modeAucuneEquipe_neDevraitPasGenererDeSectionEquipe() {
        donneesDeDemonstration();

        String html = service.genererHtml(PERIODE, detaille(FeuillesEquipeMode.AUCUNE));

        assertThat(html).contains("Chantier C059");
        assertThat(html).doesNotContain("— Équipe");
    }

    @Test
    void genererHtml_devraitEtreDuXmlBienForme_exigenceDeOpenhtmltopdf() throws Exception {
        donneesDeDemonstration();

        for (PaieReportPdfRequestDto requete : List.of(synthese(), detaille(FeuillesEquipeMode.TOUTES))) {
            String html = service.genererHtml(PERIODE, requete);
            DocumentBuilderFactory usine = DocumentBuilderFactory.newInstance();
            usine.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            usine.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            DocumentBuilder constructeur = usine.newDocumentBuilder();
            assertThat(constructeur.parse(new InputSource(new StringReader(html)))).isNotNull();
        }
    }

    @Test
    void generer_devraitProduireUnPdfValide_pourLesDeuxTypesDeRapport() throws IOException {
        donneesDeDemonstration();

        byte[] pdfSynthese = service.generer(PERIODE, synthese());
        byte[] pdfDetaille = service.generer(PERIODE, detaille(FeuillesEquipeMode.TOUTES));

        assertThat(new String(pdfSynthese, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
        assertThat(new String(pdfDetaille, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
        assertThat(pdfSynthese.length).isGreaterThan(5_000);
        assertThat(pdfDetaille.length).isGreaterThan(5_000);

        // Sorties à ouvrir à la main pour vérifier la mise en page (target/ est ignoré par git).
        Path dossier = Path.of("target", "rapports-demo");
        Files.createDirectories(dossier);
        Files.write(dossier.resolve("Paie_Rapport_Synthese_" + PERIODE + ".pdf"), pdfSynthese);
        Files.write(dossier.resolve("Paie_Rapport_Detaille_" + PERIODE + ".pdf"), pdfDetaille);
    }

    @Test
    void generer_typeRapportAbsent_devraitRetomberSurLaSynthese() {
        donneesDeDemonstration();

        String html = service.genererHtml(PERIODE,
                new PaieReportPdfRequestDto(PERIODE.toString(), null, null, null, null));

        assertThat(html).contains("Synthèse exécutive");
    }

    @Test
    void generer_devraitEchouerClairementSiAucunePaiePourLaPeriode() {
        when(repository.findByPeriode(PERIODE)).thenReturn(List.of());
        when(repository.findByPeriode(PERIODE.minusMonths(1))).thenReturn(List.of());

        assertThatThrownBy(() -> service.generer(PERIODE, synthese()))
                .isInstanceOf(AucunePaiePeriodeException.class)
                .hasMessageContaining("2026-08");
    }

    @Test
    void genererHtml_devraitAfficherVariationNonDisponibleSiMoisPrecedentIntrouvable() {
        when(repository.findByPeriode(PERIODE)).thenReturn(
                List.of(paie("BOULJIHEL SALAH", "PB85747", "OPERATEUR", "C059", "EQUIPE A", "5000", null)));
        when(repository.findByPeriode(PERIODE.minusMonths(1))).thenReturn(List.of());

        String html = service.genererHtml(PERIODE, synthese());

        assertThat(html).contains("INTROUVABLE");
        assertThat(html).contains("Variation non disponible");
    }

    private static Paie paie(String nomPrenom, String cin, String fonctionLibelle, String chantierCode,
                             String equipe, String salaire, String observation) {
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
        paie.setSalaireMensuel(new BigDecimal(salaire));
        paie.setObservation(observation);
        paie.calculerSalaireTotal();
        return paie;
    }
}