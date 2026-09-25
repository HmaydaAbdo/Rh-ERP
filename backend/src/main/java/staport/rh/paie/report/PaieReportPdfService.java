package staport.rh.paie.report;

import net.sf.jasperreports.engine.JRException;
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

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Génère le rapport PDF de paie — un rapport BI RH/Paie de synthèse pour la direction (voir
 * {@code docs/report/README.md}), pas un export tabulaire (celui-ci reste l'export Excel,
 * {@code PaieExportService}, jamais modifié par ce service). Chaîne : filtres + périmètre
 * ({@link PaieBiReportBuilder}) → gabarit JRXML unique (JasperReports Library, licence LGPL, {@code
 * resources/report/paie/jasper/rapport.jrxml}) → un seul remplissage, source de données à plat
 * ({@link LigneRapportDetailBean}, un employé par ligne, dénormalisée chantier + équipe) groupée en
 * JRXML (voir {@code rapport.jrxml} : groupe Chantier {@code isStartNewPage}, groupe Équipe
 * {@code keepTogether}) → export PDF. Un seul {@code JasperPrint} pour tout le document : le
 * {@code pageHeader}/{@code pageFooter}, définis une seule fois dans le gabarit, se répètent donc
 * nativement sur toutes les pages, sans jamais dupliquer leur définition ni concaténer plusieurs
 * impressions. Les gabarits sont compilés une seule fois (constructeur) et réutilisés à chaque
 * génération.
 */
@Service
public class PaieReportPdfService {

    private static final Logger log = LoggerFactory.getLogger(PaieReportPdfService.class);

    private static final String DOSSIER_JASPER = "report/paie/jasper/";
    private static final String CHEMIN_LOGO = "report/paie/logo-staport.png";

    private final PaieBiReportBuilder biReportBuilder;
    private final JasperReport rapportReport;
    private final JasperReport tableDistributionReport;
    private final byte[] logo;

    PaieReportPdfService(PaieBiReportBuilder biReportBuilder) {
        this.biReportBuilder = biReportBuilder;
        this.rapportReport = compiler("rapport.jrxml");
        this.tableDistributionReport = compiler("tableDistribution.jrxml");
        this.logo = chargerLogo();
    }

    /** @throws staport.rh.paie.exceptions.AucunePaiePeriodeException si aucun bulletin n'existe pour
     *          la période et les filtres donnés */
    public byte[] generer(YearMonth periode, PaieReportPdfRequestDto requete) {
        RapportBiVue vue = biReportBuilder.construire(periode, requete);

        Map<String, Object> parametres = parametres(vue);
        List<LigneRapportDetailBean> lignes = lignesDetail(vue);
        JasperPrint impression = remplir(rapportReport, parametres, new JRBeanCollectionDataSource(lignes));

        byte[] pdf = exporterPdf(impression);
        log.info("Rapport PDF BI paie généré : periode={}, chantiers={}, taille={} octets", periode, vue.chantiers().size(), pdf.length);
        return pdf;
    }

    private Map<String, Object> parametres(RapportBiVue vue) {
        SyntheseGlobaleVue synthese = vue.synthese();
        Map<String, Object> parametres = new HashMap<>();
        parametres.put("P_LOGO", nouveauFluxLogo());
        parametres.put("P_PERIODE_LIBELLE", vue.periodeLibelle());
        parametres.put("P_DATE_GENERATION", vue.dateGeneration());
        parametres.put("P_FILTRES_LIBELLE", filtresLibelle(vue.filtresActifs()));
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
        parametres.put("SUBREPORT_DISTRIBUTION", tableDistributionReport);
        return parametres;
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
            for (EquipeBiVue equipe : chantier.equipes()) {
                for (LigneEmployeVue employe : equipe.employes()) {
                    lignes.add(new LigneRapportDetailBean(
                            chantier.code(), chantier.titre(), chantierMasseLigne, chantierEffectifValeur, chantierEffectifNote,
                            chantier.partMasseGlobalePourcent(), chantier.stc(), chantier.distributionEquipe(),
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

    private String filtresLibelle(List<String> filtresActifs) {
        return filtresActifs.isEmpty() ? "Tous chantiers · Toutes fonctions · Tous employés" : String.join(" · ", filtresActifs);
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

    private InputStream nouveauFluxLogo() {
        return new ByteArrayInputStream(logo);
    }
}
