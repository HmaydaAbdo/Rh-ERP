package staport.rh.paie.report;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.awt.Font;
import java.awt.FontFormatException;
import java.awt.GraphicsEnvironment;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Base64;

/**
 * Charge une seule fois (constructeur) les ressources STATIQUES du rapport PDF de paie — polices
 * Liberation Serif, feuille de style, logo — partagées entre {@link PaieReportHtmlBuilder} (a besoin
 * du CSS et du logo pour construire le DOM) et {@link PaieReportHtmlPdfService} (a besoin des
 * polices pour les enregistrer auprès d'openhtmltopdf, voir son Javadoc) sans dépendance circulaire
 * entre les deux (aucune des deux classes ne dépend de l'autre).
 */
@Component
final class RapportRessourcesStatiques {

    private static final String DOSSIER_FONTS = "report/paie/fonts/";
    private static final String CHEMIN_CSS = "report/paie/html/rapport.css";
    private static final String CHEMIN_LOGO = "report/paie/logo-staport.png";

    /** Enregistrée une seule fois par JVM (bloc statique) : rend "Liberation Serif" disponible à
     * AWT indépendamment de l'OS — nécessaire au rendu SVG des graphiques (Batik résout ses
     * polices de texte via le {@code GraphicsEnvironment} standard, jamais via les mécanismes de
     * police propres à openhtmltopdf, voir {@link PaieReportHtmlPdfService#rendre} pour
     * l'enregistrement ÉQUIVALENT côté openhtmltopdf — deux sous-systèmes distincts, chacun a
     * besoin du sien). Même pattern, même raison que l'ancien bloc statique de
     * {@code PaieReportPdfService} (bug de production {@code JRFontNotFoundException} évité en
     * embarquant les TTF plutôt qu'en dépendant d'une police installée au niveau OS). */
    static {
        for (String fichier : new String[]{"LiberationSerif-Regular.ttf", "LiberationSerif-Bold.ttf",
                "LiberationSerif-Italic.ttf", "LiberationSerif-BoldItalic.ttf"}) {
            try (InputStream flux = new ClassPathResource(DOSSIER_FONTS + fichier).getInputStream()) {
                Font police = Font.createFont(Font.TRUETYPE_FONT, flux);
                GraphicsEnvironment.getLocalGraphicsEnvironment().registerFont(police);
            } catch (IOException | FontFormatException e) {
                throw new IllegalStateException("Police embarquée du rapport PDF de paie introuvable ou invalide : " + fichier, e);
            }
        }
    }

    final byte[] policeRegular;
    final byte[] policeBold;
    final byte[] policeItalic;
    final byte[] policeBoldItalic;
    final String css;
    private final String logoBase64;

    RapportRessourcesStatiques() {
        this.policeRegular = chargerRessource(DOSSIER_FONTS + "LiberationSerif-Regular.ttf");
        this.policeBold = chargerRessource(DOSSIER_FONTS + "LiberationSerif-Bold.ttf");
        this.policeItalic = chargerRessource(DOSSIER_FONTS + "LiberationSerif-Italic.ttf");
        this.policeBoldItalic = chargerRessource(DOSSIER_FONTS + "LiberationSerif-BoldItalic.ttf");
        this.css = new String(chargerRessource(CHEMIN_CSS), java.nio.charset.StandardCharsets.UTF_8);
        this.logoBase64 = Base64.getEncoder().encodeToString(chargerRessource(CHEMIN_LOGO));
    }

    /** Data-URI du logo Staport ({@code data:image/png;base64,...}) — jamais un chemin de fichier
     * relatif : openhtmltopdf n'a pas d'URI de base pour résoudre un chemin (même contrainte que
     * l'ancien pipeline HTML pré-JasperReports, voir docs/report/README.md), et un logo embarqué
     * en base64 fonctionne à l'identique quel que soit l'élément {@code <img>} qui le référence
     * (page de garde ET bandeau récurrent de chaque page), contrairement à un flux qui ne se lit
     * qu'une fois (piège déjà rencontré côté JasperReports avec un {@code InputStream}, voir
     * l'ancien {@code PaieReportPdfService.chargerLogo}). */
    String logoDataUri() {
        return "data:image/png;base64," + logoBase64;
    }

    private byte[] chargerRessource(String chemin) {
        try {
            return new ClassPathResource(chemin).getContentAsByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Ressource du rapport PDF de paie introuvable : " + chemin, e);
        }
    }
}
