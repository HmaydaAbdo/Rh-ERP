package staport.rh.paie.report;

import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;
import staport.rh.paie.exceptions.AucunePaiePeriodeException;
import staport.rh.paie.reporting.FeuillesEquipeMode;
import staport.rh.paie.reporting.PaiePerimetreService;
import staport.rh.paie.reporting.PerimetrePaie;
import staport.rh.paie.report.PaieReportPdfRequestDto.TypeRapport;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;

/**
 * Génère le rapport PDF de paie (synthèse exécutive ou détail par chantier) — couche de présentation
 * supplémentaire, strictement en lecture : mêmes données que l'export Excel
 * ({@link PaiePerimetreService}), aucune écriture, aucune modification de {@code PaieExportService}.
 *
 * <p>Chaîne : {@code PerimetrePaie} → vues-modèles formatées ({@link PaieReportViewModelBuilder}) →
 * templates Thymeleaf XHTML ({@code resources/report/paie/}) → PDF via openhtmltopdf.
 * Le moteur Thymeleaf est privé à ce service (jamais un ViewResolver MVC : l'application est une API REST).
 */
@Service
public class PaieReportPdfService {

    private static final Logger log = LoggerFactory.getLogger(PaieReportPdfService.class);

    /** Famille de police déclarée dans report.css ({@code font-family: 'RapportPaie'}). */
    private static final String FAMILLE_POLICE = "RapportPaie";
    private static final String CHEMIN_CSS = "report/paie/report.css";
    private static final DateTimeFormatter FORMAT_DATE_GENERATION =
            DateTimeFormatter.ofPattern("dd/MM/yyyy 'à' HH:mm", Locale.FRANCE);

    private final PaiePerimetreService perimetreService;
    private final PaieReportViewModelBuilder viewModelBuilder;
    private final PaieReportFontProvider fontProvider;
    private final SpringTemplateEngine templateEngine;
    private final String css;

    PaieReportPdfService(PaiePerimetreService perimetreService,
                         PaieReportViewModelBuilder viewModelBuilder,
                         PaieReportFontProvider fontProvider) {
        this.perimetreService = perimetreService;
        this.viewModelBuilder = viewModelBuilder;
        this.fontProvider = fontProvider;
        this.templateEngine = creerMoteurDeTemplates();
        this.css = chargerCss();
    }

    /**
     * @throws AucunePaiePeriodeException si aucun bulletin n'existe pour la période
     */
    public byte[] generer(YearMonth periode, PaieReportPdfRequestDto requete) {
        String html = genererHtml(periode, requete);
        byte[] pdf = versPdf(html);
        log.info("Rapport PDF paie généré : periode={}, type={}, taille={} octets",
                periode, typeRapport(requete), pdf.length);
        return pdf;
    }

    /** Étape HTML seule, séparée pour pouvoir être testée sans rendu PDF. */
    String genererHtml(YearMonth periode, PaieReportPdfRequestDto requete) {
        TypeRapport type = typeRapport(requete);

        // SYNTHESE : rapport agrégé, sans découpage ni exclusion par équipe (voir PaieReportPdfRequestDto).
        PerimetrePaie perimetre = type == TypeRapport.DETAILLE
                ? perimetreService.calculer(periode, requete.feuillesEquipeMode(),
                requete.equipesParChantier(), requete.equipesExcluesFeuilleChantier())
                : perimetreService.calculer(periode, FeuillesEquipeMode.AUCUNE, null, null);

        if (perimetre.lignesGlobales().isEmpty()) {
            throw new AucunePaiePeriodeException(periode);
        }

        Map<String, Object> vue = type == TypeRapport.DETAILLE
                ? viewModelBuilder.detaille(perimetre)
                : viewModelBuilder.synthese(perimetre);

        Context contexte = new Context(Locale.FRANCE);
        contexte.setVariables(vue);
        contexte.setVariable("css", css);
        contexte.setVariable("dateGeneration", LocalDateTime.now().format(FORMAT_DATE_GENERATION));

        return templateEngine.process(type == TypeRapport.DETAILLE ? "detaille" : "synthese", contexte);
    }

    private byte[] versPdf(String html) {
        try (ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            builder.useFont(fontProvider.resoudre(), FAMILLE_POLICE, 400, BaseRendererBuilder.FontStyle.NORMAL, true);
            fontProvider.resoudreGras().ifPresent(gras ->
                    builder.useFont(gras, FAMILLE_POLICE, 700, BaseRendererBuilder.FontStyle.NORMAL, true));
            builder.withHtmlContent(html, null);
            builder.toStream(sortie);
            builder.run();
            return sortie.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Erreur lors de la génération du rapport PDF de paie : " + e.getMessage(), e);
        }
    }

    private static TypeRapport typeRapport(PaieReportPdfRequestDto requete) {
        return requete.typeRapport() == null ? TypeRapport.SYNTHESE : requete.typeRapport();
    }

    private static SpringTemplateEngine creerMoteurDeTemplates() {
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver();
        resolver.setPrefix("report/paie/");
        resolver.setSuffix(".html");
        resolver.setTemplateMode(TemplateMode.HTML);
        resolver.setCharacterEncoding(StandardCharsets.UTF_8.name());
        resolver.setCacheable(true);

        SpringTemplateEngine moteur = new SpringTemplateEngine();
        moteur.setTemplateResolver(resolver);
        return moteur;
    }

    private static String chargerCss() {
        try {
            return new ClassPathResource(CHEMIN_CSS).getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Feuille de style du rapport PDF introuvable : " + CHEMIN_CSS, e);
        }
    }
}