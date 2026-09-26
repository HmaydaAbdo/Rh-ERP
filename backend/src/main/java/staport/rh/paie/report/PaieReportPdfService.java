package staport.rh.paie.report;

import net.sf.jasperreports.engine.JRException;
import net.sf.jasperreports.engine.JRPrintElement;
import net.sf.jasperreports.engine.JRPrintPage;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperFillManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.engine.data.JRBeanCollectionDataSource;
import net.sf.jasperreports.engine.export.JRPdfExporter;
import net.sf.jasperreports.export.SimpleExporterInput;
import net.sf.jasperreports.export.SimpleOutputStreamExporterOutput;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Génère le rapport PDF de paie — un rapport BI RH/Paie de synthèse pour la direction (voir
 * {@code docs/report/README.md}), pas un export tabulaire (celui-ci reste l'export Excel,
 * {@code PaieExportService}, jamais modifié par ce service). Chaîne : filtres + périmètre
 * ({@link PaieBiReportBuilder}) → gabarit JRXML unique (JasperReports Library, licence LGPL, {@code
 * resources/report/paie/jasper/rapport.jrxml}) → deux remplissages successifs → export PDF. Le
 * premier remplissage (silencieux, jamais exporté) sert uniquement à découvrir sur quelle page
 * démarre chaque section (Synthèse globale, chaque chantier) via des ancres posées dans le gabarit
 * ({@code anchorNameExpression}) ; le second remplissage, identique au premier sauf pour les numéros
 * de page désormais connus injectés dans le sous-rapport Sommaire, produit le document final — un
 * seul {@code JasperPrint} exporté, jamais de fusion de plusieurs impressions après coup (voir
 * « Sommaire » dans le README : fusionner des JasperPrint déjà rendus désynchroniserait le compteur
 * de pages du pied de page). Le {@code pageHeader}/{@code pageFooter}, définis une seule fois dans le
 * gabarit, se répètent nativement sur toutes les pages de contenu. Les gabarits sont compilés une
 * seule fois (constructeur) et réutilisés à chaque génération.
 */
@Service
public class PaieReportPdfService {

    private static final Logger log = LoggerFactory.getLogger(PaieReportPdfService.class);

    private static final String DOSSIER_JASPER = "report/paie/jasper/";
    private static final String CHEMIN_LOGO = "report/paie/logo-staport.png";
    private static final String ANCRE_SYNTHESE = "synthese-globale";
    private static final String LIBELLE_SYNTHESE = "I — Synthèse globale";
    private static final String ANCRE_GRAPH_CHANTIER = "graph-chantier";
    private static final String LIBELLE_GRAPH_CHANTIER = "II — Répartition par chantier";
    private static final String ANCRE_GRAPH_FONCTION = "graph-fonction";
    private static final String LIBELLE_GRAPH_FONCTION = "III — Répartition par fonction";

    private final PaieBiReportBuilder biReportBuilder;
    private final JasperReport rapportReport;
    private final JasperReport tableDistributionReport;
    private final JasperReport sommaireReport;
    private final byte[] logo;

    PaieReportPdfService(PaieBiReportBuilder biReportBuilder) {
        this.biReportBuilder = biReportBuilder;
        this.rapportReport = compiler("rapport.jrxml");
        this.tableDistributionReport = compiler("tableDistribution.jrxml");
        this.sommaireReport = compiler("sommaire.jrxml");
        this.logo = chargerLogo();
    }

    /** @throws staport.rh.paie.exceptions.AucunePaiePeriodeException si aucun bulletin n'existe pour
     *          la période et les filtres donnés */
    public byte[] generer(YearMonth periode, PaieReportPdfRequestDto requete) {
        RapportBiVue vue = biReportBuilder.construire(periode, requete);

        Map<String, Object> parametresBase = parametres(vue, periode);
        List<LigneRapportDetailBean> lignes = lignesDetail(vue);

        JasperPrint passeDecouverte = remplir(rapportReport, avecSommaire(parametresBase, sommaireEntrees(vue, null)),
                new JRBeanCollectionDataSource(lignes));
        Map<String, Integer> pagesParAncre = pagesParAncre(passeDecouverte);

        JasperPrint impression = remplir(rapportReport, avecSommaire(parametresBase, sommaireEntrees(vue, pagesParAncre)),
                new JRBeanCollectionDataSource(lignes));

        byte[] pdf = exporterPdf(impression);
        log.info("Rapport PDF BI paie généré : periode={}, chantiers={}, pages={}, taille={} octets",
                periode, vue.chantiers().size(), impression.getPages().size(), pdf.length);
        return pdf;
    }

    private Map<String, Object> parametres(RapportBiVue vue, YearMonth periode) {
        SyntheseGlobaleVue synthese = vue.synthese();
        Map<String, Object> parametres = new HashMap<>();
        parametres.put("P_LOGO", logo);
        parametres.put("P_PERIODE_LIBELLE", vue.periodeLibelle());
        parametres.put("P_PERIODE_MOIS", moisLibelle(periode));
        parametres.put("P_PERIODE_ANNEE", String.valueOf(periode.getYear()));
        parametres.put("P_DATE_GENERATION", vue.dateGeneration());
        parametres.put("P_MASSE_VALEUR", synthese.masse().valeurCourante());
        parametres.put("P_MASSE_VARIATION", variationLibelle(synthese.masse()));
        parametres.put("P_MASSE_TENDANCE", synthese.masse().tendance().name());
        parametres.put("P_MASSE_NOTE", masseNote(synthese.masse()));
        parametres.put("P_EFFECTIF_VALEUR", PaieReportNumberFormat.entier(synthese.effectif().effectifCourant()));
        parametres.put("P_EFFECTIF_NOTE", "Mois précédent : " + synthese.effectif().effectifPrecedent() + " (" + synthese.effectif().variation() + ")");
        parametres.put("P_MASSE_MOYENNE", synthese.masseMoyenneParEmploye());
        parametres.put("P_NOMBRE_CHANTIERS", PaieReportNumberFormat.entier(synthese.nombreChantiers()));
        parametres.put("P_REPARTITION_CHANTIER", synthese.repartitionChantier());
        parametres.put("P_REPARTITION_FONCTION", synthese.repartitionFonction());
        parametres.put("P_SYNTHESE_NARRATIF", syntheseNarratif(synthese));
        parametres.put("SUBREPORT_DISTRIBUTION", tableDistributionReport);
        parametres.put("SUBREPORT_SOMMAIRE", sommaireReport);
        return parametres;
    }

    private String moisLibelle(YearMonth periode) {
        String mois = periode.getMonth().getDisplayName(TextStyle.FULL, Locale.FRENCH);
        return Character.toUpperCase(mois.charAt(0)) + mois.substring(1);
    }

    private Map<String, Object> avecSommaire(Map<String, Object> parametresBase, List<SommaireEntreeBean> entreesSommaire) {
        Map<String, Object> parametres = new HashMap<>(parametresBase);
        parametres.put("P_SOMMAIRE_ENTREES", entreesSommaire);
        return parametres;
    }

    /** Synthèse globale + les 3 pages graphiques + une ligne par chantier — {@code pagesParAncre}
     * vaut {@code null} lors du premier passage (numéros encore inconnus, valeur de repli 0 sans
     * incidence sur la mise en page du sous-rapport, un champ numérique de largeur fixe). */
    private List<SommaireEntreeBean> sommaireEntrees(RapportBiVue vue, Map<String, Integer> pagesParAncre) {
        List<SommaireEntreeBean> entrees = new ArrayList<>();
        entrees.add(new SommaireEntreeBean(LIBELLE_SYNTHESE, pageDe(pagesParAncre, ANCRE_SYNTHESE)));
        entrees.add(new SommaireEntreeBean(LIBELLE_GRAPH_CHANTIER, pageDe(pagesParAncre, ANCRE_GRAPH_CHANTIER)));
        entrees.add(new SommaireEntreeBean(LIBELLE_GRAPH_FONCTION, pageDe(pagesParAncre, ANCRE_GRAPH_FONCTION)));
        for (ChantierBiVue chantier : vue.chantiers()) {
            entrees.add(new SommaireEntreeBean(chantier.titre(), pageDe(pagesParAncre, "chantier-" + chantier.code())));
        }
        return entrees;
    }

    private int pageDe(Map<String, Integer> pagesParAncre, String ancre) {
        return pagesParAncre == null ? 0 : pagesParAncre.getOrDefault(ancre, 0);
    }

    /** Relit un {@code JasperPrint} déjà rendu pour retrouver, pour chaque ancre posée dans le
     * gabarit ({@code synthese-globale}, {@code chantier-<code>}), la première page (1-based) où elle
     * apparaît — c'est le seul moyen d'obtenir des numéros de page réels avant le remplissage final,
     * JasperReports ne les connaissant qu'après la mise en page complète du document. */
    private Map<String, Integer> pagesParAncre(JasperPrint impression) {
        Map<String, Integer> pages = new HashMap<>();
        List<JRPrintPage> toutesPages = impression.getPages();
        for (int i = 0; i < toutesPages.size(); i++) {
            for (JRPrintElement element : toutesPages.get(i).getElements()) {
                if (element instanceof net.sf.jasperreports.engine.JRPrintAnchor ancre && ancre.getAnchorName() != null) {
                    pages.putIfAbsent(ancre.getAnchorName(), i + 1);
                }
            }
        }
        return pages;
    }

    /** Aplatit chantiers → équipes → employés en une seule liste à plat, dénormalisée avec le
     * contexte chantier/équipe — source de données unique de {@code rapport.jrxml} (voir
     * {@link LigneRapportDetailBean}). */
    private List<LigneRapportDetailBean> lignesDetail(RapportBiVue vue) {
        List<LigneRapportDetailBean> lignes = new ArrayList<>();
        for (ChantierBiVue chantier : vue.chantiers()) {
            String chantierMasseLigne = masseLigne(chantier.masse());
            String chantierEffectifValeur = PaieReportNumberFormat.entier(chantier.effectif().effectifCourant());
            String chantierEffectifNote = "mois préc. " + chantier.effectif().effectifPrecedent() + " (" + chantier.effectif().variation() + ")";
            String chantierNarratif = chantierNarratif(chantier);
            for (EquipeBiVue equipe : chantier.equipes()) {
                for (LigneEmployeVue employe : equipe.employes()) {
                    lignes.add(new LigneRapportDetailBean(
                            chantier.code(), chantier.titre(), chantierMasseLigne, chantierEffectifValeur, chantierEffectifNote,
                            chantier.partMasseGlobalePourcent(), chantier.stc(), chantierNarratif, chantier.distributionEquipe(),
                            equipe.nom(), equipe.titre(), equipe.effectif(), equipe.masse(), equipe.partChantierPourcent(),
                            employe));
                }
            }
        }
        return lignes;
    }

    private JasperPrint remplir(JasperReport report, Map<String, Object> parametres, net.sf.jasperreports.engine.JRDataSource datasource) {
        try {
            return JasperFillManager.fillReport(report, parametres, datasource);
        } catch (JRException e) {
            throw new IllegalStateException("Erreur lors du remplissage du rapport PDF de paie (" + report.getName() + ") : " + e.getMessage(), e);
        }
    }

    private byte[] exporterPdf(JasperPrint impression) {
        try (ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            JRPdfExporter exporter = new JRPdfExporter();
            exporter.setExporterInput(new SimpleExporterInput(impression));
            exporter.setExporterOutput(new SimpleOutputStreamExporterOutput(sortie));
            exporter.exportReport();
            return sortie.toByteArray();
        } catch (JRException | IOException e) {
            throw new UncheckedIOException("Erreur lors de l'export PDF du rapport de paie : " + e.getMessage(), new IOException(e));
        }
    }

    /** {@code null} (aucune comparaison) quand la tendance est NON_DISPONIBLE — jamais affiché dans
     * ce cas (voir la bande dédiée du JRXML). */
    private String variationLibelle(KpiMontantVue masse) {
        if (masse.tendance() == PaieReportNumberFormat.Tendance.NON_DISPONIBLE) {
            return null;
        }
        String pourcent = masse.variationPourcent() != null ? " (" + masse.variationPourcent() + ")" : " (% non calculable)";
        return masse.variationAbsolue() + " DH" + pourcent;
    }

    private String masseNote(KpiMontantVue masse) {
        return masse.tendance() == PaieReportNumberFormat.Tendance.NON_DISPONIBLE
                ? "Aucune donnée le mois précédent pour ce périmètre"
                : "Mois précédent : " + masse.valeurPrecedente() + " DH";
    }

    /** Ligne compacte masse + comparaison pour le bandeau KPI d'un chantier (une seule ligne de
     * texte, pas de badge coloré comme la synthèse globale) — formule de repli volontairement plus
     * courte que {@link #masseNote} pour tenir sur une ligne quel que soit le montant du chantier. */
    private String masseLigne(KpiMontantVue masse) {
        String variation = variationLibelle(masse);
        return variation == null
                ? masse.valeurCourante() + " DH  (aucune donnée mois précédent)"
                : masse.valeurCourante() + " DH  (" + variation + ")";
    }

    /** Phrase courte de synthèse (style « narratif léger ») affichée sous les cartes KPI de la page
     * Synthèse globale — un résumé factuel en une ligne, pas un tableau de plus. */
    private String syntheseNarratif(SyntheseGlobaleVue synthese) {
        String variation = variationLibelle(synthese.masse());
        String masseSegment = "Masse : " + synthese.masse().valeurCourante() + " DH"
                + (variation == null ? " (aucune donnée mois précédent)" : " (" + variation + ")");
        return masseSegment
                + "  ·  Effectif : " + PaieReportNumberFormat.entier(synthese.effectif().effectifCourant())
                + "  ·  " + PaieReportNumberFormat.entier(synthese.nombreChantiers()) + " chantiers.";
    }

    /** Phrase courte de synthèse d'un chantier — même esprit que {@link #syntheseNarratif}, la
     * clause STC/sortie est omise quand elle vaut 0 (rien à signaler). */
    private String chantierNarratif(ChantierBiVue chantier) {
        String base = chantier.partMasseGlobalePourcent() + " de la masse globale  ·  "
                + PaieReportNumberFormat.entier(chantier.effectif().effectifCourant()) + " pers";
        return chantier.stc() > 0
                ? base + "  ·  " + chantier.stc() + " STC/sortie(s)."
                : base + ".";
    }

    private JasperReport compiler(String nomFichier) {
        try (InputStream flux = new ClassPathResource(DOSSIER_JASPER + nomFichier).getInputStream()) {
            return JasperCompileManager.compileReport(flux);
        } catch (IOException | JRException e) {
            throw new IllegalStateException("Erreur lors de la compilation du gabarit JRXML " + nomFichier + " : " + e.getMessage(), e);
        }
    }

    private byte[] chargerLogo() {
        try {
            return new ClassPathResource(CHEMIN_LOGO).getContentAsByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("Logo du rapport PDF introuvable : " + CHEMIN_LOGO, e);
        }
    }
}
