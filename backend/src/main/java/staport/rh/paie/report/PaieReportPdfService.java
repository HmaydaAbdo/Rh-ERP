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

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Génère le rapport PDF de paie — un rapport BI RH/Paie de synthèse pour la direction (voir
 * {@code docs/report/README.md}), pas un export tabulaire (celui-ci reste l'export Excel,
 * {@code PaieExportService}, jamais modifié par ce service). Chaîne : filtres + périmètre
 * ({@link PaieBiReportBuilder}, qui interroge {@code PaieRepository} directement — ce rapport
 * n'utilise pas {@code PaiePerimetreService}, conçu pour une sélection manuelle de sous-feuilles,
 * un besoin différent) → template Thymeleaf (`resources/report/paie/rapport.html`) → PDF via
 * openhtmltopdf. Le moteur Thymeleaf est privé à ce service (jamais un ViewResolver MVC : l'application
 * est une API REST).
 */
@Service
public class PaieReportPdfService {

    private static final Logger log = LoggerFactory.getLogger(PaieReportPdfService.class);

    private static final String FAMILLE_POLICE = "RapportPaie";
    private static final String CHEMIN_CSS = "report/paie/report.css";

    private final PaieBiReportBuilder biReportBuilder;
    private final PaieReportFontProvider fontProvider;
    private final SpringTemplateEngine templateEngine;
    private final String css;

    PaieReportPdfService(PaieBiReportBuilder biReportBuilder, PaieReportFontProvider fontProvider) {
        this.biReportBuilder = biReportBuilder;
        this.fontProvider = fontProvider;
        this.templateEngine = creerMoteurDeTemplates();
        this.css = chargerCss();
    }

    /** @throws staport.rh.paie.exceptions.AucunePaiePeriodeException si aucun bulletin n'existe pour
     *          la période et les filtres donnés */
    public byte[] generer(YearMonth periode, PaieReportPdfRequestDto requete) {
        String html = genererHtml(periode, requete);
        byte[] pdf = versPdf(html);
        log.info("Rapport PDF BI paie généré : periode={}, taille={} octets", periode, pdf.length);
        return pdf;
    }

    /** Étape HTML seule, séparée pour pouvoir être testée sans rendu PDF. */
    String genererHtml(YearMonth periode, PaieReportPdfRequestDto requete) {
        RapportBiVue vue = biReportBuilder.construire(periode, requete);

        Map<String, Object> variables = new HashMap<>();
        variables.put("periodeLibelle", vue.periodeLibelle());
        variables.put("dateGeneration", vue.dateGeneration());
        variables.put("filtresActifs", vue.filtresActifs());
        variables.put("synthese", vue.synthese());
        variables.put("matriceFonctionChantier", vue.matriceFonctionChantier());
        variables.put("chantiers", vue.chantiers());

        Context contexte = new Context(Locale.FRANCE);
        contexte.setVariables(variables);
        contexte.setVariable("css", css);

        return templateEngine.process("rapport", contexte);
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
