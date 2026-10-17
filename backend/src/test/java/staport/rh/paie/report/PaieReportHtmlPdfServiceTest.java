package staport.rh.paie.report;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
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
import java.awt.image.BufferedImage;
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
 * la bonne vue-modèle (voir {@code PaieBiReportBuilderTest}). Les tests contrôlent le rendu des
 * graphiques PDF aux niveaux global et chantier, le chemin avec équipes détaillées et squelette
 * matériel, ainsi que la non-régression de l'incident de production lié à l'échappement HTML (voir
 * le Javadoc de {@link PaieReportHtmlBuilder}).
 */
@ExtendWith(MockitoExtension.class)
class PaieReportHtmlPdfServiceTest {

    @Mock
    private PaieRepository repository;

    private PaieReportHtmlPdfService service;

    private static final PaieReportPdfRequestDto REQUETE_SANS_FILTRE =
            new PaieReportPdfRequestDto("2026-09", null, null, null, null, null, null);

    @BeforeEach
    void setUp() {
        RapportRessourcesStatiques ressources = new RapportRessourcesStatiques();
        RapportChartSvgBuilder chartSvgBuilder = new RapportChartSvgBuilder();
        RapportEvolutionSvgBuilder evolutionSvgBuilder = new RapportEvolutionSvgBuilder();
        PaieBiReportBuilder biReportBuilder = new PaieBiReportBuilder(repository);
        RapportPageModelBuilder pageModelBuilder = new RapportPageModelBuilder();
        PaieReportHtmlBuilder htmlBuilder = new PaieReportHtmlBuilder(ressources, chartSvgBuilder, evolutionSvgBuilder);
        service = new PaieReportHtmlPdfService(ressources, biReportBuilder, pageModelBuilder, htmlBuilder);
    }

    @Test
    void generer_devraitProduireUnPdfValide() throws IOException {
        Paie c059EquipeA = paie("EMPLOYE UN", "CIN1", "MACON", "C059", "EQUIPE A", "5000", null);
        Paie c059SansEquipe = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", null, "3000", "STC");
        Paie c068EquipeB = paie("EMPLOYE TROIS", "CIN3", "MACON", "C068", "EQUIPE B", "4000", null);
        Paie precedent = paie("EMPLOYE UN", "CIN1", "MACON", "C059", "EQUIPE A", "4500", null);

        @SuppressWarnings("unchecked")
        List<Paie> courant = List.of(c059EquipeA, c059SansEquipe, c068EquipeB);
        when(repository.findAll(any(Specification.class))).thenReturn(courant, List.of(precedent));
        staport.rh.paie.repositories.EvolutionChantierEquipeProjection historique =
                org.mockito.Mockito.mock(staport.rh.paie.repositories.EvolutionChantierEquipeProjection.class);
        when(historique.getChantierCode()).thenReturn("C059");
        when(historique.getPeriode()).thenReturn(YearMonth.of(2026, 9));
        when(historique.getMasse()).thenReturn(new BigDecimal("12000"));
        when(historique.getEffectif()).thenReturn(3L);
        when(historique.getStc()).thenReturn(0L);
        when(historique.getStcMontant()).thenReturn(BigDecimal.ZERO);
        when(repository.sommerParChantierEquipePeriode(any(YearMonth.class), any(YearMonth.class)))
                .thenReturn(List.of(historique));

        byte[] pdf = service.generer(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE);

        assertThat(pdf).isNotEmpty();
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
        try (PDDocument document = PDDocument.load(pdf)) {
            BufferedImage pageSynthese = new PDFRenderer(document).renderImage(1);
            assertThat(nombrePixelsBleus(pageSynthese))
                    .as("la série masse salariale du graphique global est réellement rendue")
                    .isGreaterThan(20);
            String texte = new PDFTextStripper().getText(document);
            assertThat(texte).contains("1. Masse salariale et montants des STC (DH)",
                    "2. Effectif rémunéré et sorties du personnel (personnes)", "3. Répartition par chantier",
                    "4. Liste des employés");
            assertThat(texte).doesNotContain("Périmètre : Tous les marchés", "Historique disponible :", "12 mois");
            int pageEvolution = pageContenantTexte(document, "1. Masse salariale et montants des STC (DH)");
            assertThat(textePage(document, pageEvolution))
                    .contains("2. Effectif rémunéré et sorties du personnel (personnes)");
            int pageFonction = pageContenantTexte(document, "3. Répartition par fonction");
            BufferedImage repartitionFonction = new PDFRenderer(document).renderImage(pageFonction);
            assertThat(nombrePixelsBleus(repartitionFonction))
                    .as("la répartition par fonction du chantier est réellement rendue")
                    .isGreaterThan(20);
        }
    }

    /** Rapport d'un seul chantier, sans vue d'ensemble : un PDF valide, sans les deux pages globales. */
    @Test
    void generer_sansVueEnsembleProduitUnPdfValideSansLaPageGlobale() {
        Paie c059 = paie("EMPLOYE UN", "CIN1", "MACON", "C059", "EQUIPE A", "5000", null);
        @SuppressWarnings("unchecked")
        List<Paie> courant = List.of(c059);
        when(repository.findAll(any(Specification.class))).thenReturn(courant, List.of(), courant, List.of());

        byte[] complet = service.generer(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE);
        byte[] sansEnsemble = service.generer(YearMonth.of(2026, 9),
                new PaieReportPdfRequestDto("2026-09", null, null, null, null, null, null, true));

        assertThat(new String(sansEnsemble, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
        assertThat(sansEnsemble.length).isLessThan(complet.length);
    }

    /** Exerce le chemin le plus à risque du gabarit (chantier avec équipe détaillée sélectionnée,
     * section "reste", tableaux récap Fonction/Effectif/STC et parc matériel C168/CH/OP). */
    @Test
    void generer_devraitProduireUnPdfValideAvecEquipeDetailleeEtSqueletteMateriel() throws IOException {
        Paie c168Ch = paie("EMPLOYE UN", "CIN1", "CHAUFFEUR", "C168", "CH", "5000", null);
        Paie c168Op = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR ENGIN", "C168", "OP", "4500", null);
        Paie c168AutreEquipe = paie("EMPLOYE TROIS", "CIN3", "MACON", "C168", "EQUIPE X", "3000", null);

        @SuppressWarnings("unchecked")
        List<Paie> courant = List.of(c168Ch, c168Op, c168AutreEquipe);
        when(repository.findAll(any(Specification.class))).thenReturn(courant, List.of());

        PaieReportPdfRequestDto requeteAvecDetail = new PaieReportPdfRequestDto(
                "2026-09", null, null, null, null, null, Map.of("C168", List.of("CH", "OP")),
                Map.of("CAMION CITERNE", 3, "PELLE PNEU", 2), null);

        byte[] pdf = service.generer(YearMonth.of(2026, 9), requeteAvecDetail);

        assertThat(pdf).isNotEmpty();
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
        try (PDDocument document = PDDocument.load(pdf)) {
            assertThat(document.getNumberOfPages()).isGreaterThan(2);
            String texte = new PDFTextStripper().getText(document);
            assertThat(texte).contains("4. Parc matériel — CAMION", "5. Liste des employés",
                    "EMPLOYE UN", "EMPLOYE DEUX");
            int pageRepartitionEquipe = pageContenantTexte(document, "3. Répartition par équipe");
            BufferedImage pageChantier = new PDFRenderer(document).renderImage(pageRepartitionEquipe);
            assertThat(nombrePixelsBleus(pageChantier))
                    .as("pixels bleus du graphique par équipe rendu sur la page de répartition chantier")
                    .isGreaterThan(20);

            int pageGraphiqueMateriel = -1;
            PDFTextStripper extracteur = new PDFTextStripper();
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                extracteur.setStartPage(page);
                extracteur.setEndPage(page);
                if (extracteur.getText(document).contains("4. Parc matériel — CAMION")) {
                    pageGraphiqueMateriel = page - 1;
                    break;
                }
            }
            assertThat(pageGraphiqueMateriel).as("page contenant le graphique matériel").isGreaterThanOrEqualTo(0);
            assertThat(textePage(document, pageGraphiqueMateriel)).contains("3. Répartition par fonction");
            BufferedImage graphiqueMateriel = new PDFRenderer(document).renderImage(pageGraphiqueMateriel);
            assertThat(nombrePixelsViolets(graphiqueMateriel))
                    .as("pixels violets des barres du graphique matériel réellement rendu dans le PDF")
                    .isGreaterThan(20);
        }
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
        // (la cellule passe à la ligne : on compare sans les retours à la ligne insérés par le renvoi au mot)
        assertThat(texte.replaceAll("\\s+", "")).contains(chargeHostile.replaceAll("\\s+", ""));
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
        paie.setNombreJoursTravailles(BigDecimal.valueOf(26));
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

    /** Vérifie le dessin SVG réellement rendu dans le PDF, sans dépendre de l'extraction textuelle des glyphes. */
    private long nombrePixelsBleus(BufferedImage image) {
        long nombre = 0;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int rgb = image.getRGB(x, y);
                int rouge = (rgb >> 16) & 0xff;
                int vert = (rgb >> 8) & 0xff;
                int bleu = rgb & 0xff;
                if (rouge >= 30 && rouge <= 45 && vert >= 90 && vert <= 110 && bleu >= 220 && bleu <= 245) {
                    nombre++;
                }
            }
        }
        return nombre;
    }

    private int pageContenantTexte(PDDocument document, String texte) throws IOException {
        for (int page = 0; page < document.getNumberOfPages(); page++) {
            if (textePage(document, page).contains(texte)) {
                return page;
            }
        }
        throw new AssertionError("Texte introuvable dans le PDF : " + texte);
    }

    private String textePage(PDDocument document, int index) throws IOException {
        PDFTextStripper extracteur = new PDFTextStripper();
        extracteur.setStartPage(index + 1);
        extracteur.setEndPage(index + 1);
        return extracteur.getText(document);
    }

    /** Vérifie le rendu du remplissage violet du graphique matériel sans dépendre de l'extraction SVG. */
    private long nombrePixelsViolets(BufferedImage image) {
        long nombre = 0;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int rgb = image.getRGB(x, y);
                int rouge = (rgb >> 16) & 0xff;
                int vert = (rgb >> 8) & 0xff;
                int bleu = rgb & 0xff;
                if (rouge >= 90 && rouge <= 150 && vert >= 20 && vert <= 100 && bleu >= 170) {
                    nombre++;
                }
            }
        }
        return nombre;
    }
}
