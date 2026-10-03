package staport.rh.paie.report;

import org.jsoup.nodes.Element;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;

/**
 * Construit les graphiques en barres horizontales groupées du rapport — en SVG, construit à la
 * main via jsoup (jamais JFreeChart, retiré avec JasperReports — voir {@code docs/report/README.md}
 * pour la justification de ce choix). Remplace {@code PaieReportGroupedChartCustomizer}, en porte la
 * même logique de normalisation.
 *
 * <p><b>Règle absolue, comme partout dans {@link PaieReportHtmlBuilder}</b> : chaque valeur passe par
 * {@code Element.text(...)}, jamais {@code Element.html(...)}. {@code RepartitionBean.getMontant()}/
 * {@code getStcMontant()} peuvent être {@code null} (seul endroit de toute la vue-modèle où une
 * valeur affichable n'est pas déjà une {@code String} pré-formatée non nulle, voir le Javadoc de
 * {@code PaieReportHtmlPdfService}) — {@link #libelleValeur} traite {@code null} comme zéro
 * (aucune barre, aucune étiquette), jamais la chaîne littérale "null" (c'est très exactement là que
 * l'incident de production historique #2 pourrait resurgir dans du code neuf si ce null-check était
 * omis — voir {@code RapportChartSvgBuilderTest}, test de non-régression dédié).
 */
@Component
final class RapportChartSvgBuilder {

    private static final double LARGEUR_TOTALE = 802;
    /** Largeur de la colonne des libellés : estimée d'après le plus long libellé (police 9 pt), bornée. */
    private static final double LARGEUR_LABEL_MIN = 48;
    private static final double LARGEUR_LABEL_MAX = 200;
    private static final double LARGEUR_PAR_CARACTERE = 5.8;
    /** Marge réservée à droite des barres pour l'étiquette de valeur (police 6 pt gras, ex. « 12 345 678,00 DH »). */
    private static final double MARGE_DROITE = 64;
    /** Hauteur maximale de la zone de tracé, en pt : le graphique (légende comprise) doit tenir sous le
     * bandeau, le titre de chapitre et les cartes KPI d'une page paysage A4 (corps de page de 495 pt). */
    private static final double HAUTEUR_TOTALE_CHART = 292;
    /** Le moteur de rendu (openhtmltopdf + Batik) ignore les attributs {@code width}/{@code height} du SVG et
     * dimensionne le dessin d'après son {@code viewBox}, exprimé en px (1 px = 0,75 pt) : le repère de dessin
     * ci-dessous est en pt, il est donc agrandi de 4/3 pour occuper TOUTE la largeur utile de la page (802 pt) —
     * sans cela, le graphique n'en occupait que les trois quarts. */
    private static final double PX_PAR_PT = 4.0 / 3;
    private static final double HAUTEUR_LEGENDE = 24;
    private static final double HAUTEUR_CATEGORIE_MAX = 44;
    /** Part de la hauteur d'une catégorie occupée par ses 4 barres : le reste est l'espace blanc qui sépare
     * visuellement deux catégories voisines. Légèrement plus élevée quand les catégories sont nombreuses
     * (hauteur de catégorie sous {@link #HAUTEUR_CATEGORIE_SERREE}), pour que les étiquettes de valeur de deux
     * barres voisines ne se chevauchent pas. */
    private static final double PART_BARRES_PAR_CATEGORIE = 0.78;
    private static final double PART_BARRES_CATEGORIES_SERREES = 0.86;
    private static final double HAUTEUR_CATEGORIE_SERREE = 26;
    private static final double TAILLE_VALEUR_MAX = 6.5;
    private static final double TAILLE_VALEUR_MIN = 4.5;
    /** Espace entre deux barres d'une même catégorie, en pt. */
    private static final double ECART_ENTRE_BARRES = 0.6;

    private record Serie(String nom, String couleur) {
    }

    private static final List<Serie> SERIES = List.of(
            new Serie("Masse (DH)", "#2563EB"),
            new Serie("Effectif (personnes)", "#F59E0B"),
            new Serie("STC (personnes)", "#B91C1C"),
            new Serie("STC (DH)", "#7F1D1D")
    );

    void ajouterGraphique(Element corps, List<RepartitionBean> donnees) {
        Element container = corps.appendElement("div").addClass("chart-container");
        if (donnees.isEmpty()) {
            return;
        }

        double[] maxParSerie = new double[SERIES.size()];
        for (RepartitionBean ligne : donnees) {
            maxParSerie[0] = Math.max(maxParSerie[0], valeurMontant(ligne.getMontant()));
            maxParSerie[1] = Math.max(maxParSerie[1], ligne.getEffectif());
            maxParSerie[2] = Math.max(maxParSerie[2], ligne.getStc());
            maxParSerie[3] = Math.max(maxParSerie[3], valeurMontant(ligne.getStcMontant()));
        }

        double largeurLabel = largeurColonneLibelles(donnees);
        double largeurPlot = LARGEUR_TOTALE - largeurLabel - MARGE_DROITE;
        double hauteurCategorie = Math.min(HAUTEUR_CATEGORIE_MAX, HAUTEUR_TOTALE_CHART / donnees.size());
        double hauteurPlot = hauteurCategorie * donnees.size();
        double hauteurSvg = hauteurPlot + HAUTEUR_LEGENDE;

        Element svg = container.appendElement("svg")
                .attr("xmlns", "http://www.w3.org/2000/svg")
                .attr("width", format(LARGEUR_TOTALE * PX_PAR_PT) + "px")
                .attr("height", format(hauteurSvg * PX_PAR_PT) + "px")
                .attr("viewBox", "0 0 " + format(LARGEUR_TOTALE * PX_PAR_PT) + " " + format(hauteurSvg * PX_PAR_PT));
        Element dessin = svg.appendElement("g").attr("transform", "scale(" + PX_PAR_PT + ")");

        double partBarres = hauteurCategorie < HAUTEUR_CATEGORIE_SERREE ? PART_BARRES_CATEGORIES_SERREES : PART_BARRES_PAR_CATEGORIE;
        double groupeHauteur = hauteurCategorie * partBarres;
        double itemGap = ECART_ENTRE_BARRES;
        double barHauteur = (groupeHauteur - (SERIES.size() - 1) * itemGap) / SERIES.size();
        // Une étiquette ne doit pas dépasser le pas vertical entre deux barres (sinon elle recouvre sa voisine).
        String tailleValeur = format(Math.max(TAILLE_VALEUR_MIN, Math.min(TAILLE_VALEUR_MAX, barHauteur + itemGap)));

        dessin.appendElement("line")
                .attr("x1", format(largeurLabel)).attr("y1", "0")
                .attr("x2", format(largeurLabel)).attr("y2", format(hauteurPlot))
                .attr("stroke", "#9CA3AF").attr("stroke-width", "0.6");

        for (int i = 0; i < donnees.size(); i++) {
            RepartitionBean ligne = donnees.get(i);
            double yCategorie = i * hauteurCategorie + (hauteurCategorie - groupeHauteur) / 2;

            if (i > 0) {
                dessin.appendElement("line")
                        .attr("x1", "0").attr("y1", format(i * hauteurCategorie))
                        .attr("x2", format(LARGEUR_TOTALE)).attr("y2", format(i * hauteurCategorie))
                        .attr("stroke", "#E5E7EB").attr("stroke-width", "0.5");
            }

            Element texteLabel = dessin.appendElement("text")
                    .attr("x", format(largeurLabel - 6))
                    .attr("y", format(yCategorie + groupeHauteur / 2))
                    .attr("text-anchor", "end")
                    .attr("dominant-baseline", "middle")
                    .attr("font-size", "9.5")
                    .attr("font-weight", "bold");
            texteLabel.text(ligne.getLibelle());

            double[] valeurs = {valeurMontant(ligne.getMontant()), ligne.getEffectif(), ligne.getStc(), valeurMontant(ligne.getStcMontant())};
            for (int s = 0; s < SERIES.size(); s++) {
                double y = yCategorie + s * (barHauteur + itemGap);
                double largeur = maxParSerie[s] <= 0 ? 0 : (valeurs[s] / maxParSerie[s]) * largeurPlot;

                if (largeur > 0) {
                    dessin.appendElement("rect")
                            .attr("x", format(largeurLabel))
                            .attr("y", format(y))
                            .attr("width", format(largeur))
                            .attr("height", format(barHauteur))
                            .attr("fill", SERIES.get(s).couleur());

                    String libelleValeur = s == 0 || s == 3
                            ? libelleMontant(s == 0 ? ligne.getMontant() : ligne.getStcMontant())
                            : PaieReportNumberFormat.entier((int) valeurs[s]);
                    dessin.appendElement("text")
                            .attr("x", format(largeurLabel + largeur + 4))
                            .attr("y", format(y + barHauteur / 2))
                            .attr("dominant-baseline", "middle")
                            .attr("font-size", tailleValeur)
                            .attr("font-weight", "bold")
                            .text(libelleValeur);
                }
            }
        }

        ajouterLegende(dessin, hauteurPlot, largeurLabel);
    }

    private double largeurColonneLibelles(List<RepartitionBean> donnees) {
        int plusLong = donnees.stream().mapToInt(ligne -> ligne.getLibelle() == null ? 0 : ligne.getLibelle().length()).max().orElse(0);
        return Math.max(LARGEUR_LABEL_MIN, Math.min(LARGEUR_LABEL_MAX, plusLong * LARGEUR_PAR_CARACTERE + 12));
    }

    private void ajouterLegende(Element svg, double y, double xDepart) {
        double x = xDepart;
        for (Serie serie : SERIES) {
            svg.appendElement("rect")
                    .attr("x", format(x))
                    .attr("y", format(y + 6))
                    .attr("width", "8")
                    .attr("height", "8")
                    .attr("fill", serie.couleur());
            Element texte = svg.appendElement("text")
                    .attr("x", format(x + 11))
                    .attr("y", format(y + 12))
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

    private String format(double valeur) {
        return String.valueOf(Math.round(valeur * 100) / 100.0);
    }
}
