package staport.rh.paie.report;

import org.jsoup.nodes.Element;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;

/**
 * Construit les graphiques en barres horizontales groupées du rapport — en SVG, construit à la
 * main via jsoup (jamais JFreeChart, retiré avec JasperReports — voir {@code docs/report/README.md}
 * pour la justification de ce choix).
 *
 * <p><b>Disposition</b> : une ligne par catégorie (chantier ou équipe). À gauche son libellé, au centre ses 4
 * barres fines et espacées (une par série), à droite ses 4 valeurs <b>écrites en colonnes alignées</b> sur une
 * seule ligne. Les valeurs ne sont jamais posées au bout des barres : c'est ce qui rendait le graphique illisible
 * (les étiquettes de deux barres voisines se chevauchaient dès que les barres étaient fines). Ici, la hauteur
 * minimale d'une ligne est celle d'un seul texte, jamais celle de 4 : aucun chevauchement n'est possible, quel que
 * soit le nombre de catégories.
 *
 * <p><b>Règle absolue, comme partout dans {@link PaieReportHtmlBuilder}</b> : chaque valeur passe par
 * {@code Element.text(...)}, jamais {@code Element.html(...)}. {@code RepartitionBean.getMontant()}/
 * {@code getStcMontant()} peuvent être {@code null} (seul endroit de toute la vue-modèle où une
 * valeur affichable n'est pas déjà une {@code String} pré-formatée non nulle, voir le Javadoc de
 * {@code PaieReportHtmlPdfService}) — {@link #libelleValeur} traite {@code null} comme zéro (« – »), jamais la
 * chaîne littérale "null" (c'est très exactement là que l'incident de production historique #2 pourrait
 * resurgir dans du code neuf si ce null-check était omis — voir {@code RapportChartSvgBuilderTest}, test de
 * non-régression dédié).
 */
@Component
final class RapportChartSvgBuilder {

    private static final double LARGEUR_TOTALE = 802;
    /** Largeur de la colonne des libellés : estimée d'après le plus long libellé (police 9,5 pt gras), bornée. */
    private static final double LARGEUR_LABEL_MIN = 48;
    private static final double LARGEUR_LABEL_MAX = 200;
    /** Corps, interligne et marges (6 pt de chaque côté) du libellé d'une ligne : un nom de chantier plus long que la
     * colonne (jusqu'à 255 caractères) passe sur plusieurs lignes au lieu d'être coupé. */
    private static final double TAILLE_LIBELLE = 9.5;
    private static final double INTERLIGNE_LIBELLE = 11;
    private static final double MARGES_LIBELLE = 12;
    private static final double MARGE_VERTICALE_RANGEE = 4;
    /** Hauteur minimale d'une ligne : celle que garantit la pagination de {@link RapportPageModelBuilder} (au plus 16 lignes
     * par page dans {@value #HAUTEUR_TOTALE_CHART} pt). Une ligne dont le libellé occupe plusieurs lignes est plus haute. */
    static final double HAUTEUR_RANGEE_MIN = 20;
    /** Largeur des 4 colonnes de valeurs (Masse, Effectif, STC personnes, STC DH), dans l'ordre des séries. */
    private static final double[] LARGEUR_COLONNES = {86, 58, 62, 86};
    /** Espace entre la fin des barres et la première colonne de valeurs. */
    private static final double ECART_AVANT_COLONNES = 12;
    /** Hauteur totale maximale du graphique (en-tête des colonnes, lignes et légende comprises), en pt : il doit
     * tenir sous le bandeau, le titre de chapitre et les cartes KPI d'une page paysage A4 (corps de page de 495 pt). */
    static final double HAUTEUR_TOTALE_CHART = 361;
    /** Le moteur de rendu (openhtmltopdf + Batik) ignore les attributs {@code width}/{@code height} du SVG et
     * dimensionne le dessin d'après son {@code viewBox}, exprimé en px (1 px = 0,75 pt) : le repère de dessin
     * ci-dessous est en pt, il est donc agrandi de 4/3 pour occuper TOUTE la largeur utile de la page (802 pt) —
     * sans cela, le graphique n'en occupait que les trois quarts. */
    private static final double PX_PAR_PT = 4.0 / 3;
    static final double HAUTEUR_ENTETE = 14;
    static final double HAUTEUR_LEGENDE = 24;
    private static final double HAUTEUR_CATEGORIE_MAX = 40;
    /** Part de la hauteur d'une ligne occupée par ses 4 barres ; le reste est l'espace blanc entre deux lignes. */
    private static final double PART_BARRES_PAR_CATEGORIE = 0.72;
    /** Espace blanc entre deux barres d'une même ligne, en pt. */
    private static final double ECART_ENTRE_BARRES = 1.4;
    private static final double TAILLE_VALEUR = 7.5;

    private record Serie(String nom, String enTete, String couleur) {
    }

    private static final List<Serie> SERIES = List.of(
            new Serie("Masse (DH)", "Masse", "#2563EB"),
            new Serie("Effectif (personnes)", "Effectif", "#F59E0B"),
            new Serie("STC (personnes)", "STC pers.", "#B91C1C"),
            new Serie("STC (DH)", "STC DH", "#7F1D1D")
    );

    void ajouterGraphique(Element corps, List<RepartitionBean> donnees) {
        ajouterGraphique(corps, donnees, donnees);
    }

    /** {@code echelle} : lignes dont les maxima fixent la longueur des barres (un graphique réparti sur plusieurs
     * pages passe ici l'ensemble des lignes, pour que les barres restent comparables d'une page à l'autre). */
    void ajouterGraphique(Element corps, List<RepartitionBean> donnees, List<RepartitionBean> echelle) {
        ajouterGraphique(corps, donnees, echelle, HAUTEUR_TOTALE_CHART);
    }

    /** {@code hauteurMax} : hauteur totale que le graphique ne doit pas dépasser (voir {@link PageModel.BlocGraphique}). */
    void ajouterGraphique(Element corps, List<RepartitionBean> donnees, List<RepartitionBean> echelle, double hauteurMax) {
        Element container = corps.appendElement("div").addClass("chart-container");
        if (donnees.isEmpty()) {
            return;
        }

        double[] maxParSerie = new double[SERIES.size()];
        for (RepartitionBean ligne : echelle) {
            maxParSerie[0] = Math.max(maxParSerie[0], valeurMontant(ligne.getMontant()));
            maxParSerie[1] = Math.max(maxParSerie[1], ligne.getEffectif());
            maxParSerie[2] = Math.max(maxParSerie[2], ligne.getStc());
            maxParSerie[3] = Math.max(maxParSerie[3], valeurMontant(ligne.getStcMontant()));
        }

        double largeurColonnes = 0;
        for (double largeur : LARGEUR_COLONNES) {
            largeurColonnes += largeur;
        }
        List<List<String>> libellesParLigne = donnees.stream().map(ligne -> lignesLibelle(ligne.getLibelle())).toList();
        double largeurLabel = largeurColonneLibelles(libellesParLigne);
        double largeurPlot = LARGEUR_TOTALE - largeurLabel - ECART_AVANT_COLONNES - largeurColonnes;
        double hauteurDisponible = hauteurMax - HAUTEUR_ENTETE - HAUTEUR_LEGENDE;
        double hauteurCategorie = Math.min(HAUTEUR_CATEGORIE_MAX, hauteurDisponible / donnees.size());
        double[] hauteursLignes = hauteursLignes(libellesParLigne, hauteurCategorie);
        if (somme(hauteursLignes) > hauteurDisponible) {
            // Libellés sur plusieurs lignes : on retombe sur la hauteur minimale, que la pagination garantit
            hauteurCategorie = HAUTEUR_RANGEE_MIN;
            hauteursLignes = hauteursLignes(libellesParLigne, hauteurCategorie);
        }
        double hauteurPlot = somme(hauteursLignes);
        double hauteurSvg = HAUTEUR_ENTETE + hauteurPlot + HAUTEUR_LEGENDE;

        Element svg = container.appendElement("svg")
                .attr("xmlns", "http://www.w3.org/2000/svg")
                .attr("width", format(LARGEUR_TOTALE * PX_PAR_PT) + "px")
                .attr("height", format(hauteurSvg * PX_PAR_PT) + "px")
                .attr("viewBox", "0 0 " + format(LARGEUR_TOTALE * PX_PAR_PT) + " " + format(hauteurSvg * PX_PAR_PT));
        Element dessin = svg.appendElement("g").attr("transform", "scale(" + PX_PAR_PT + ")");

        double[] finColonne = new double[SERIES.size()];
        double x = largeurLabel + largeurPlot + ECART_AVANT_COLONNES;
        for (int s = 0; s < SERIES.size(); s++) {
            x += LARGEUR_COLONNES[s];
            finColonne[s] = x;
        }

        ajouterEnteteColonnes(dessin, finColonne);

        double groupeHauteur = hauteurCategorie * PART_BARRES_PAR_CATEGORIE;
        double barHauteur = (groupeHauteur - (SERIES.size() - 1) * ECART_ENTRE_BARRES) / SERIES.size();

        dessin.appendElement("line")
                .attr("x1", format(largeurLabel)).attr("y1", format(HAUTEUR_ENTETE))
                .attr("x2", format(largeurLabel)).attr("y2", format(HAUTEUR_ENTETE + hauteurPlot))
                .attr("stroke", "#9CA3AF").attr("stroke-width", "0.6");

        double yLigne = HAUTEUR_ENTETE;
        for (int i = 0; i < donnees.size(); i++) {
            RepartitionBean ligne = donnees.get(i);
            double hauteurLigne = hauteursLignes[i];
            if (i > 0) {
                yLigne += hauteursLignes[i - 1];
            }
            double yCentre = yLigne + hauteurLigne / 2;
            double yGroupe = yLigne + (hauteurLigne - groupeHauteur) / 2;

            if (i > 0) {
                dessin.appendElement("line")
                        .attr("x1", "0").attr("y1", format(yLigne))
                        .attr("x2", format(LARGEUR_TOTALE)).attr("y2", format(yLigne))
                        .attr("stroke", "#E5E7EB").attr("stroke-width", "0.5");
            }

            List<String> lignesLibelle = libellesParLigne.get(i);
            for (int k = 0; k < lignesLibelle.size(); k++) {
                dessin.appendElement("text")
                        .attr("x", format(largeurLabel - MARGES_LIBELLE / 2))
                        .attr("y", format(yCentre + (k - (lignesLibelle.size() - 1) / 2.0) * INTERLIGNE_LIBELLE))
                        .attr("text-anchor", "end")
                        .attr("dominant-baseline", "middle")
                        .attr("font-size", format(TAILLE_LIBELLE))
                        .attr("font-weight", "bold")
                        .text(lignesLibelle.get(k));
            }

            double[] valeurs = {valeurMontant(ligne.getMontant()), ligne.getEffectif(), ligne.getStc(), valeurMontant(ligne.getStcMontant())};
            String[] libelles = {
                    libelleValeur(valeurs[0], libelleMontant(ligne.getMontant())),
                    libelleValeur(valeurs[1], PaieReportNumberFormat.entier(ligne.getEffectif())),
                    libelleValeur(valeurs[2], PaieReportNumberFormat.entier(ligne.getStc())),
                    libelleValeur(valeurs[3], libelleMontant(ligne.getStcMontant()))
            };

            for (int s = 0; s < SERIES.size(); s++) {
                double largeur = maxParSerie[s] <= 0 ? 0 : (valeurs[s] / maxParSerie[s]) * largeurPlot;
                if (largeur > 0) {
                    dessin.appendElement("rect")
                            .attr("x", format(largeurLabel))
                            .attr("y", format(yGroupe + s * (barHauteur + ECART_ENTRE_BARRES)))
                            .attr("width", format(largeur))
                            .attr("height", format(barHauteur))
                            .attr("fill", SERIES.get(s).couleur());
                }

                dessin.appendElement("text")
                        .attr("x", format(finColonne[s]))
                        .attr("y", format(yCentre))
                        .attr("text-anchor", "end")
                        .attr("dominant-baseline", "middle")
                        .attr("font-size", format(TAILLE_VALEUR))
                        .attr("font-weight", "bold")
                        .text(libelles[s]);
            }
        }

        ajouterLegende(dessin, HAUTEUR_ENTETE + hauteurPlot, largeurLabel);
    }

    /** Titre de chaque colonne de valeurs, souligné d'un filet de la couleur de sa série : la couleur relie la
     * colonne à ses barres sans dépendre de la largeur réelle du texte (qu'on ne peut pas mesurer ici). */
    private void ajouterEnteteColonnes(Element dessin, double[] finColonne) {
        for (int s = 0; s < SERIES.size(); s++) {
            Serie serie = SERIES.get(s);
            dessin.appendElement("rect")
                    .attr("x", format(finColonne[s] - LARGEUR_COLONNES[s] + 6))
                    .attr("y", format(HAUTEUR_ENTETE - 3.5))
                    .attr("width", format(LARGEUR_COLONNES[s] - 6))
                    .attr("height", "2.5")
                    .attr("fill", serie.couleur());
            dessin.appendElement("text")
                    .attr("x", format(finColonne[s]))
                    .attr("y", format((HAUTEUR_ENTETE - 3.5) / 2))
                    .attr("text-anchor", "end")
                    .attr("dominant-baseline", "middle")
                    .attr("font-size", "7")
                    .attr("font-weight", "bold")
                    .text(serie.enTete());
        }
    }

    /** Les lignes du libellé une fois passé à la ligne dans la colonne des libellés, à sa largeur maximale : une colonne
     * plus étroite (tous les libellés tiennent alors sur une ligne) donne le même découpage. Jamais vide. */
    static List<String> lignesLibelle(String libelle) {
        return RapportMesureTexte.decouper(libelle, LARGEUR_LABEL_MAX - MARGES_LIBELLE, TAILLE_LIBELLE, true);
    }

    /** Hauteur minimale de la ligne d'un graphique pour ce libellé (utilisée par la pagination de
     * {@link RapportPageModelBuilder}). */
    static double hauteurMinimaleLigne(String libelle) {
        return hauteurLigne(lignesLibelle(libelle).size(), HAUTEUR_RANGEE_MIN);
    }

    private static double hauteurLigne(int lignesLibelle, double hauteurBase) {
        return Math.max(hauteurBase, lignesLibelle * INTERLIGNE_LIBELLE + MARGE_VERTICALE_RANGEE);
    }

    private double[] hauteursLignes(List<List<String>> libellesParLigne, double hauteurBase) {
        return libellesParLigne.stream().mapToDouble(lignes -> hauteurLigne(lignes.size(), hauteurBase)).toArray();
    }

    private double somme(double[] valeurs) {
        double total = 0;
        for (double valeur : valeurs) {
            total += valeur;
        }
        return total;
    }

    /** Largeur de la colonne des libellés : celle du plus large des libellés déjà découpés, bornée. */
    private double largeurColonneLibelles(List<List<String>> libellesParLigne) {
        double plusLarge = libellesParLigne.stream().flatMap(List::stream)
                .mapToDouble(ligne -> RapportMesureTexte.largeur(ligne, TAILLE_LIBELLE, true)).max().orElse(0);
        return Math.max(LARGEUR_LABEL_MIN, Math.min(LARGEUR_LABEL_MAX, plusLarge + MARGES_LIBELLE));
    }

    private void ajouterLegende(Element svg, double y, double xDepart) {
        double x = xDepart;
        for (Serie serie : SERIES) {
            svg.appendElement("rect")
                    .attr("x", format(x))
                    .attr("y", format(y + 8))
                    .attr("width", "8")
                    .attr("height", "8")
                    .attr("fill", serie.couleur());
            Element texte = svg.appendElement("text")
                    .attr("x", format(x + 11))
                    .attr("y", format(y + 14))
                    .attr("dominant-baseline", "middle")
                    .attr("font-size", "8.5");
            texte.text(serie.nom());
            x += 15 + estimationLargeurTexte(serie.nom());
        }
    }

    /** Estimation grossière (pas de mesure réelle de police disponible côté SVG construit à la
     * main) — suffisante pour espacer des libellés de légende COURTS et FIXES (4 valeurs connues à
     * l'avance, jamais une donnée métier variable), une imprécision de quelques points n'a aucune
     * conséquence visible ici. */
    private double estimationLargeurTexte(String texte) {
        return texte.length() * 4.6 + 18;
    }

    /** {@code null} traité comme zéro (jamais la chaîne "null", voir le Javadoc de la classe). */
    private double valeurMontant(BigDecimal montant) {
        return montant == null ? 0 : montant.doubleValue();
    }

    private String libelleMontant(BigDecimal montant) {
        return montant == null ? null : PaieReportNumberFormat.montant(montant) + " DH";
    }

    /** Une valeur nulle ou absente s'affiche « – » : une colonne vide serait ambiguë. */
    private String libelleValeur(double valeur, String libelleFormate) {
        return valeur <= 0 || libelleFormate == null ? "–" : libelleFormate;
    }

    private String format(double valeur) {
        return String.valueOf(Math.round(valeur * 100) / 100.0);
    }
}
