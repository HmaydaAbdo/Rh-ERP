package staport.rh.paie.report;

import com.openhtmltopdf.extend.FSSupplier;
import com.openhtmltopdf.outputdevice.helper.BaseRendererBuilder.FontStyle;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.openhtmltopdf.svgsupport.BatikSVGDrawer;
import org.jsoup.helper.W3CDom;
import org.jsoup.nodes.Document;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.Locale;
import staport.rh.paie.audit.PerimetreRapportPdfPaie;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.annotations.AuditableAction;

/**
 * Génère le rapport PDF de paie — remplace {@code PaieReportPdfService} (JasperReports/JRXML),
 * retiré après migration vers un pipeline HTML/CSS pur (demande explicite de direction,
 * 2026-09-29 : "refaites-le en HTML, maîtrisez-le, pas d'erreur cette fois" — voir
 * {@code docs/report/README.md} pour l'historique complet de cette décision, y compris la
 * découverte que ce rapport avait DÉJÀ été en HTML avant JasperReports, abandonné pour 3 bugs de
 * production précis que ce nouveau pipeline neutralise structurellement, un par un — voir les
 * Javadoc de {@link PaieReportHtmlBuilder}/{@link RapportChartSvgBuilder}).
 *
 * <p>Chaîne : filtres + périmètre ({@link PaieBiReportBuilder}, INCHANGÉ — toute la logique métier
 * et le formatage restent dedans) → découpage en pages ({@link RapportPageModelBuilder}, calcul
 * arithmétique pur, aucun rendu) → construction du DOM ({@link PaieReportHtmlBuilder}, jsoup pur)
 * → un SEUL rendu PDF (openhtmltopdf, voir {@link #rendre}). Contrairement à l'ancien service
 * JasperReports, AUCUN double passage n'est nécessaire : {@link RapportPageModelBuilder} connaît
 * déjà, au moment où il construit la liste des pages, sur quelle page démarre chaque chapitre et
 * quel texte de bandeau "GLOBAL"/"CHANTIER : X" chaque page porte — il n'y a rien à "découvrir"
 * après coup (voir son Javadoc).
 */
@Service
public class PaieReportHtmlPdfService {

    private static final String FAMILLE_POLICE = "Liberation Serif";

    private final RapportRessourcesStatiques ressources;
    private final PaieBiReportBuilder biReportBuilder;
    private final RapportPageModelBuilder pageModelBuilder;
    private final PaieReportHtmlBuilder htmlBuilder;

    PaieReportHtmlPdfService(RapportRessourcesStatiques ressources, PaieBiReportBuilder biReportBuilder,
                              RapportPageModelBuilder pageModelBuilder, PaieReportHtmlBuilder htmlBuilder) {
        this.ressources = ressources;
        this.biReportBuilder = biReportBuilder;
        this.pageModelBuilder = pageModelBuilder;
        this.htmlBuilder = htmlBuilder;
    }

    /** @throws staport.rh.paie.exceptions.AucunePaiePeriodeException si aucun bulletin n'existe pour
     *          la période et les filtres donnés */
    @AuditableAction(action = "PAIE_RAPPORT_PDF", categorie = CategorieAudit.ACCES, perimetre = PerimetreRapportPdfPaie.class)
    public byte[] generer(YearMonth periode, PaieReportPdfRequestDto requete) {
        RapportBiVue vue = biReportBuilder.construire(periode, requete);
        java.util.List<PageModel> pages = pageModelBuilder.construire(vue, requete.vueEnsembleRetiree());
        String mois = moisLibelle(periode);
        String annee = String.valueOf(periode.getYear());
        Document doc = htmlBuilder.construireDocument(mois, annee, vue.periodeLibelle(), pages);
        return rendre(doc);
    }

    private String moisLibelle(YearMonth periode) {
        String mois = periode.getMonth().getDisplayName(TextStyle.FULL, Locale.FRENCH);
        return Character.toUpperCase(mois.charAt(0)) + mois.substring(1);
    }

    /** Rend un document jsoup déjà entièrement construit en PDF — AUCUNE construction de DOM ici,
     * uniquement la conversion finale. Un seul appel à openhtmltopdf (voir le Javadoc de la
     * classe) : le document reçu est déjà entièrement paginé (un {@code <div class="page">} par
     * page physique, taille fixe), il n'y a plus aucune décision de mise en page à prendre pour le
     * moteur de rendu. */
    byte[] rendre(Document documentJsoup) {
        org.w3c.dom.Document documentW3c = new W3CDom().fromJsoup(documentJsoup);
        try (ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useSVGDrawer(new BatikSVGDrawer());
            enregistrerPolices(builder);
            builder.withW3cDocument(documentW3c, "");
            builder.toStream(sortie);
            builder.run();
            return sortie.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("Erreur lors du rendu PDF du rapport de paie : " + e.getMessage(), e);
        }
    }

    /** Enregistrement des 4 polices Liberation Serif auprès d'openhtmltopdf — sous-système de
     * police DISTINCT de l'enregistrement AWT du bloc statique de {@link RapportRessourcesStatiques}
     * (jamais l'un ne suffit pour l'autre) : openhtmltopdf résout ses polices via ses propres
     * {@code PdfRendererBuilder.useFont}, jamais via le {@code GraphicsEnvironment} AWT. Un appel
     * par fichier, chacun avec le poids/style exact qu'il représente — c'est ce qui garantit que
     * {@code font-weight: bold}/{@code font-style: italic} en CSS résolvent vers le VRAI fichier
     * gras/italique embarqué plutôt qu'un gras/italique synthétique (moins fidèle visuellement). */
    private void enregistrerPolices(PdfRendererBuilder builder) {
        builder.useFont(supplierDepuis(ressources.policeRegular), FAMILLE_POLICE, 400, FontStyle.NORMAL, false);
        builder.useFont(supplierDepuis(ressources.policeBold), FAMILLE_POLICE, 700, FontStyle.NORMAL, false);
        builder.useFont(supplierDepuis(ressources.policeItalic), FAMILLE_POLICE, 400, FontStyle.ITALIC, false);
        builder.useFont(supplierDepuis(ressources.policeBoldItalic), FAMILLE_POLICE, 700, FontStyle.ITALIC, false);
    }

    private FSSupplier<InputStream> supplierDepuis(byte[] octets) {
        return () -> new ByteArrayInputStream(octets);
    }
}
