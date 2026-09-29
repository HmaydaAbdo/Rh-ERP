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

import java.awt.Font;
import java.awt.FontFormatException;
import java.awt.GraphicsEnvironment;
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
 * ({@link PaieBiReportBuilder}) → gabarit JRXML principal (JasperReports Library, licence LGPL,
 * {@code resources/report/paie/jasper/rapport.jrxml}), lui-même invoquant deux sous-rapports pour les
 * tableaux à nombre de lignes variable de chaque section équipe (récap Fonction/Effectif/STC, parc
 * matériel — voir {@code recap-fonction.jrxml}/{@code recap-materiel.jrxml}) → deux remplissages
 * successifs → export PDF.
 *
 * <p>Le document n'a pas de sommaire imprimé (retiré, demande explicite de direction — un rapport
 * généré à la demande n'a pas besoin d'une table des matières) : le double remplissage sert
 * uniquement à connaître, AVANT le remplissage final, sur quelle page démarre le premier chantier
 * (ancre {@code anchorNameExpression="chantier-<code>"} posée dans le gabarit) — seul moyen d'obtenir
 * ce numéro de page réel, JasperReports ne le connaissant qu'après la mise en page complète. Cette
 * valeur ({@code P_PAGE_PREMIER_CHANTIER}) pilote uniquement le bloc « Niveau » du
 * {@code pageHeader}/{@code pageFooter} : GLOBAL avant ce seuil, CHANTIER (+ ÉQUIPE) à partir de lui.
 * Premier remplissage silencieux (jamais exporté, page provisoire {@code Integer.MAX_VALUE}) ; second
 * remplissage identique sauf ce seuil désormais connu, qui produit le document final — un seul
 * {@code JasperPrint} réellement exporté, jamais de fusion de plusieurs impressions après coup (qui
 * désynchroniserait le compteur {@code $V{PAGE_NUMBER}} du pied de page). Le
 * {@code pageHeader}/{@code pageFooter}, définis une seule fois dans le gabarit, se répètent
 * nativement sur toutes les pages de contenu. Les gabarits sont compilés une seule fois (constructeur)
 * et réutilisés à chaque génération.
 */
@Service
public class PaieReportPdfService {

    private static final Logger log = LoggerFactory.getLogger(PaieReportPdfService.class);

    private static final String DOSSIER_JASPER = "report/paie/jasper/";
    private static final String CHEMIN_LOGO = "report/paie/logo-staport.png";

    /** Nombre de chapitres romains fixes avant le premier chantier — un seul désormais, « I — Vue
     * d'ensemble » (demande explicite de direction : le graphique "Vue par chantier", auparavant
     * chapitre romain « II », est devenu la sous-section arabe "2" de ce même chapitre I, voir
     * rapport.jrxml GroupGraphChantier) — détermine à partir de quel chiffre romain démarre la
     * numérotation des chantiers (voir {@link #chapitreChantier}), désormais II au lieu de III. */
    private static final int CHAPITRES_FIXES = 1;

    /** Constantes de mise en page utilisées UNIQUEMENT par {@link #calculerSautPage} pour prédire,
     * arithmétiquement, où le tableau employé de chaque section équipe déborderait naturellement de
     * page en page — jamais consommées ailleurs (la mise en page réelle reste entièrement pilotée par
     * {@code rapport.jrxml}) : toutes tirées telles quelles des attributs du gabarit
     * ({@code pageWidth}/{@code pageHeight}/marges, hauteur du {@code pageHeader}/{@code pageFooter},
     * hauteur du {@code groupHeader} de {@code GroupEquipe}, hauteur de la bande {@code <detail>}) — à
     * maintenir manuellement synchronisées si l'un de ces attributs change un jour dans le gabarit
     * (aucun moyen de les lire dynamiquement depuis un simple {@code JasperReport} compilé sans risquer
     * l'aller-retour que {@code docs/report/README.md} déconseille). Voir le Javadoc de
     * {@link #calculerSautPage} pour l'algorithme complet. */
    private static final int PAGE_HAUTEUR_UTILE = 495; // 595 (pageHeight) - 20 - 20 (marges) - 40 (pageHeader) - 20 (pageFooter)
    private static final int GROUPE_EQUIPE_ENTETE_HAUTEUR = 56; // GroupEquipe.groupHeader, 1re page d'une section seulement
    private static final int LIGNE_HAUTEUR = 16; // <detail>
    private static final int GROUPE_EQUIPE_PIED_RESERVE = 220; // GroupEquipe.groupFooter, hauteur nominale (voir son commentaire dans rapport.jrxml)

    /** Enregistrée une seule fois par JVM (bloc statique, chargé avant toute instanciation de ce
     * service) : rend la police "Liberation Serif" disponible à AWT indépendamment de ce qui est
     * installé au niveau du système d'exploitation qui exécute le backend. L'extension de police
     * JasperReports ({@code jasperreports_extension.properties} + {@code
     * report/paie/fonts/liberation-serif-fonts.xml}) couvre déjà les éléments texte des gabarits
     * JRXML, mais {@link PaieReportGroupedChartCustomizer} construit des {@code java.awt.Font}
     * directement (JFreeChart, pas JasperReports) — ce chemin ne passe pas par cette extension et doit
     * donc pouvoir résoudre le nom de famille via le {@code GraphicsEnvironment} standard. Sans cet
     * enregistrement explicite, un environnement de déploiement sans cette police installée au
     * niveau OS lève {@code JRFontNotFoundException} au premier remplissage (constaté en production,
     * alors que le même rapport se générait sans erreur dans un environnement de développement où la
     * police était, elle, installée système — voir docs/report/README.md, section « Style visuel »). */
    static {
        for (String fichier : new String[]{"LiberationSerif-Regular.ttf", "LiberationSerif-Bold.ttf",
                "LiberationSerif-Italic.ttf", "LiberationSerif-BoldItalic.ttf"}) {
            try (InputStream flux = new ClassPathResource("report/paie/fonts/" + fichier).getInputStream()) {
                Font police = Font.createFont(Font.TRUETYPE_FONT, flux);
                GraphicsEnvironment.getLocalGraphicsEnvironment().registerFont(police);
            } catch (IOException | FontFormatException e) {
                throw new IllegalStateException("Police embarquée du rapport PDF de paie introuvable ou invalide : " + fichier, e);
            }
        }
    }

    private final PaieBiReportBuilder biReportBuilder;
    private final JasperReport rapportReport;
    /** Sous-rapport du tableau récap Fonction/Effectif/STC de chaque section équipe (voir
     * recap-fonction.jrxml) — nombre de fonctions variable, imprimé via {@code <subreport>} plutôt
     * qu'un nombre fixe d'éléments JRXML (voir GroupEquipe dans rapport.jrxml). Compilé une seule fois
     * ici, comme {@code rapportReport}, jamais recompilé à chaque génération. */
    private final JasperReport recapFonctionReport;
    /** Sous-rapport du squelette "parc matériel" (CAMION/ENGINS, chantier "C168" — voir
     * {@code MaterielChantierCatalogue}) — même mécanisme de sous-rapport que {@code recapFonctionReport},
     * vide (donc invisible) pour toute autre section. */
    private final JasperReport recapMaterielReport;
    private final byte[] logo;

    PaieReportPdfService(PaieBiReportBuilder biReportBuilder) {
        this.biReportBuilder = biReportBuilder;
        this.rapportReport = compiler("rapport.jrxml");
        this.recapFonctionReport = compiler("recap-fonction.jrxml");
        this.recapMaterielReport = compiler("recap-materiel.jrxml");
        this.logo = chargerLogo();
    }

    /** @throws staport.rh.paie.exceptions.AucunePaiePeriodeException si aucun bulletin n'existe pour
     *          la période et les filtres donnés */
    public byte[] generer(YearMonth periode, PaieReportPdfRequestDto requete) {
        RapportBiVue vue = biReportBuilder.construire(periode, requete);

        Map<String, Object> parametresBase = parametres(vue, periode);
        List<LigneRapportDetailBean> lignes = lignesDetail(vue);

        JasperPrint passeDecouverte = remplir(rapportReport,
                avecPagePremierChantier(parametresBase, Integer.MAX_VALUE),
                new JRBeanCollectionDataSource(lignes));
        Map<String, Integer> pagesParAncre = pagesParAncre(passeDecouverte);
        int pagePremierChantier = pageDe(pagesParAncre, "chantier-" + vue.chantiers().get(0).code());

        JasperPrint impression = remplir(rapportReport,
                avecPagePremierChantier(parametresBase, pagePremierChantier),
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
        parametres.put("P_MASSE_VALEUR", synthese.masse().valeurCourante());
        parametres.put("P_EFFECTIF_VALEUR", PaieReportNumberFormat.entier(synthese.effectif().effectifCourant()));
        parametres.put("P_MASSE_MOYENNE", synthese.masseMoyenneParEmploye());
        parametres.put("P_NOMBRE_CHANTIERS", PaieReportNumberFormat.entier(synthese.nombreChantiers()));
        parametres.put("P_STC_VALEUR", PaieReportNumberFormat.entier(synthese.stc()));
        parametres.put("P_REPARTITION_CHANTIER", synthese.repartitionChantier());
        parametres.put("P_REPARTITION_FONCTION", synthese.repartitionFonction());
        parametres.put("P_EVOLUTION_MENSUELLE", synthese.evolutionMensuelle());
        parametres.put("P_SUBREPORT_RECAP_FONCTION", recapFonctionReport);
        parametres.put("P_SUBREPORT_RECAP_MATERIEL", recapMaterielReport);
        return parametres;
    }

    private String moisLibelle(YearMonth periode) {
        String mois = periode.getMonth().getDisplayName(TextStyle.FULL, Locale.FRENCH);
        return Character.toUpperCase(mois.charAt(0)) + mois.substring(1);
    }

    /** @param pagePremierChantier seuil du bloc Niveau du pageHeader (voir rapport.jrxml) —
     *          {@code Integer.MAX_VALUE} lors du passage de découverte (page réelle encore inconnue,
     *          sans incidence : ce passage n'est jamais exporté). */
    private Map<String, Object> avecPagePremierChantier(Map<String, Object> parametresBase, Integer pagePremierChantier) {
        Map<String, Object> parametres = new HashMap<>(parametresBase);
        parametres.put("P_PAGE_PREMIER_CHANTIER", pagePremierChantier);
        return parametres;
    }

    private int pageDe(Map<String, Integer> pagesParAncre, String ancre) {
        return pagesParAncre == null ? 0 : pagesParAncre.getOrDefault(ancre, 0);
    }

    /** Titre de chapitre numéroté d'un chantier ("II — CHANTIER : C168", puis III, IV, ...) — même
     * style que le chapitre fixe ("I — Vue d'ensemble"), voir {@code rapport.jrxml} (chaque chantier
     * est un chapitre du rapport au même titre que le chapitre I, qu'il ait ou non une équipe
     * détaillée — voir {@code docs/report/rapport-v2.md}, plus de chapitre final consolidé séparé).
     * {@code index} est la position du chantier dans {@code vue.chantiers()} (déjà triée par masse
     * décroissante, voir {@code PaieBiReportBuilder}), jamais recalculée indépendamment entre les
     * différents passages de remplissage pour rester synchronisée. */
    private String chapitreChantier(int index, ChantierBiVue chantier) {
        return PaieReportNumberFormat.romain(CHAPITRES_FIXES + index + 1) + " — " + chantier.titre();
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

    /** Aplatit chantiers → sections (équipe détaillée ou "reste") → employés en une seule liste à
     * plat, dénormalisée avec le contexte chantier/section — source de données unique de
     * {@code rapport.jrxml} (voir {@link LigneRapportDetailBean}). Chaque chantier a désormais son
     * propre chapitre, qu'il ait ou non une équipe détaillée (voir {@code docs/report/rapport-v2.md}) :
     * {@code index} numérote donc TOUS les chantiers de {@code vue.chantiers()} (déjà triée par masse
     * décroissante), jamais seulement un sous-ensemble. */
    private List<LigneRapportDetailBean> lignesDetail(RapportBiVue vue) {
        List<LigneRapportDetailBean> lignes = new ArrayList<>();
        List<ChantierBiVue> chantiers = vue.chantiers();

        for (int index = 0; index < chantiers.size(); index++) {
            ChantierBiVue chantier = chantiers.get(index);
            String chantierTitreNumerote = chapitreChantier(index, chantier);
            String chantierMasseLigne = masseLigne(chantier.masse());
            String chantierEffectifValeur = PaieReportNumberFormat.entier(chantier.effectif().effectifCourant());
            for (EquipeBiVue equipe : chantier.equipes()) {
                List<LigneEmployeVue> employes = equipe.employes();
                int total = employes.size();
                int indexSautPage = calculerSautPage(total);
                for (int i = 0; i < total; i++) {
                    lignes.add(new LigneRapportDetailBean(
                            chantier.code(), chantier.identifiant(), chantierTitreNumerote, chantierMasseLigne, chantier.masseMoyenneParEmploye(),
                            chantierEffectifValeur,
                            chantier.stc(),
                            chantier.repartitionEquipe(), chantier.evolutionMensuelle(),
                            chantier.avecDetailEquipe(),
                            equipe.nom(), equipe.libelleAffiche(), equipe.titre(), equipe.effectif(), equipe.masse(), equipe.partChantierPourcent(),
                            equipe.stc(), equipe.montantMoisPrecedentOuIntrouvable(), equipe.repartitionFonction(),
                            equipe.materiel(),
                            employes.get(i),
                            i == indexSautPage));
                }
            }
        }
        return lignes;
    }

    /** Calcule, pour une section équipe de {@code total} employés, l'index 0-based (dans cette
     * section) de la ligne devant porter {@code sautPageAvant=true} — ou {@code -1} si aucun saut
     * anticipé n'est nécessaire (voir le champ {@code $F{sautPageAvant}} de rapport.jrxml et son
     * {@code <break type="Page">} en tête de la bande {@code <detail>}).
     *
     * <p><b>Pourquoi un calcul arithmétique plutôt qu'une astuce JasperReports</b> (demande explicite
     * de direction, 2026-09-29 : le bloc TOTAL GENERAL ne doit jamais apparaître seul en haut d'une
     * page) : un premier essai, un groupe JRXML imbriqué gardant les 4 dernières lignes ensemble via
     * {@code keepTogether}, s'est révélé insuffisant sur données réelles — d'une part 4 lignes (64px)
     * ne suffisent pas à garantir que le groupFooter (jusqu'à {@value #GROUPE_EQUIPE_PIED_RESERVE}px)
     * tienne derrière elles, d'autre part JasperReports décide qu'une bande "tient" sur la page
     * courante en comparant sa HAUTEUR DÉCLARÉE à l'espace restant, jamais sa hauteur réellement
     * nécessaire — un groupFooter peut donc être intégralement repoussé même quand il resterait
     * largement la place pour son contenu réel (peu de fonctions/matériel ce mois-ci). Cette méthode
     * contourne cette limite en prédisant, par le calcul, EXACTEMENT où JasperReports ferait déborder
     * chaque page (la hauteur de ligne, des bandeaux et des marges sont toutes des constantes fixes du
     * gabarit, jamais du texte à hauteur variable) et en forçant un unique saut de page anticipé
     * lorsque la dernière page ainsi prédite ne laisserait pas la place à
     * {@value #GROUPE_EQUIPE_PIED_RESERVE}px de groupFooter.
     *
     * <p>Principe : simule le remplissage NATUREL des pages (1re page : {@code
     * GROUPE_EQUIPE_ENTETE_HAUTEUR} + lignes ; pages suivantes : lignes seules, l'en-tête de section
     * n'étant jamais réimprimé — voir {@code isReprintHeaderOnEachPage="false"}), à pleine capacité
     * SANS réserver de place pour le footer. Si la DERNIÈRE de ces pages naturelles dépasse la
     * capacité qu'elle aurait AVEC le footer réservé, l'excédent est déplacé vers une page
     * supplémentaire via un unique saut de page anticipé — jamais recalculé pour les pages
     * précédentes, qui débordent normalement (débordement JasperReports natif, inchangé). */
    int calculerSautPage(int total) {
        int capPremiereSansFooter = (PAGE_HAUTEUR_UTILE - GROUPE_EQUIPE_ENTETE_HAUTEUR) / LIGNE_HAUTEUR;
        int capPremiereAvecFooter = (PAGE_HAUTEUR_UTILE - GROUPE_EQUIPE_ENTETE_HAUTEUR - GROUPE_EQUIPE_PIED_RESERVE) / LIGNE_HAUTEUR;
        int capContinuationSansFooter = PAGE_HAUTEUR_UTILE / LIGNE_HAUTEUR;
        int capContinuationAvecFooter = (PAGE_HAUTEUR_UTILE - GROUPE_EQUIPE_PIED_RESERVE) / LIGNE_HAUTEUR;

        if (total <= capPremiereAvecFooter) {
            return -1; // tout (lignes + footer) tient sur la seule 1re page, aucun saut à forcer
        }

        // Simule le remplissage naturel jusqu'à trouver la taille de la DERNIÈRE page, et si c'est
        // encore la 1re page de la section ou déjà une page de continuation (les 2 capacités "avec
        // footer" diffèrent, voir plus haut) — total > capPremiereAvecFooter est déjà acquis ci-dessus,
        // mais NE garantit PAS que la section déborde sur plusieurs pages (total peut très bien rester
        // ≤ capPremiereSansFooter, auquel cas la 1re page reste aussi la dernière).
        int taillePageCourante;
        boolean dernierePageEstPremiere;
        if (total <= capPremiereSansFooter) {
            taillePageCourante = total;
            dernierePageEstPremiere = true;
        } else {
            dernierePageEstPremiere = false;
            int restant = (total - capPremiereSansFooter) % capContinuationSansFooter;
            taillePageCourante = restant == 0 ? capContinuationSansFooter : restant;
        }

        int capDerniereAvecFooter = dernierePageEstPremiere ? capPremiereAvecFooter : capContinuationAvecFooter;
        if (taillePageCourante <= capDerniereAvecFooter) {
            return -1; // la dernière page naturelle laisse déjà la place au footer
        }
        int aDeplacer = taillePageCourante - capDerniereAvecFooter;
        return total - aDeplacer; // 1er index (0-based) de la nouvelle dernière page, avec le footer
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

    /** Ligne compacte masse + comparaison pour le bandeau KPI d'un chantier (une seule ligne de
     * texte, pas de badge coloré comme la synthèse globale) — formule de repli volontairement plus
     * courte que {@link #masseNote} pour tenir sur une ligne quel que soit le montant du chantier. */
    private String masseLigne(KpiMontantVue masse) {
        String variation = variationLibelle(masse);
        return variation == null
                ? masse.valeurCourante() + " DH  (aucune donnée mois précédent)"
                : masse.valeurCourante() + " DH  (" + variation + ")";
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
