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
    private static final double LARGEUR_LABEL_CATEGORIE = 140;
    private static final double MARGE_DROITE = 65;
    private static final double LARGEUR_PLOT = LARGEUR_TOTALE - LARGEUR_LABEL_CATEGORIE - MARGE_DROITE;
    private static final double HAUTEUR_TOTALE_CHART = 370;
    private static final double HAUTEUR_LEGENDE = 24;
    private static final double HAUTEUR_CATEGORIE_MAX = 44;

    /** Plafond du plus long segment d'une série (jamais 100% de la largeur du plot, pour que son
     * étiquette de valeur ne soit jamais coupée en bord de zone de tracé) — reconduit à l'identique
     * depuis {@code PaieReportGroupedChartCustomizer.ECHELLE_MAX}. */
    private static final double ECHELLE_MAX = 0.82;

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

        double hauteurCategorie = Math.min(HAUTEUR_CATEGORIE_MAX, HAUTEUR_TOTALE_CHART / donnees.size());
        double hauteurPlot = hauteurCategorie * donnees.size();
        double hauteurSvg = hauteurPlot + HAUTEUR_LEGENDE;

        Element svg = container.appendElement("svg")
                .attr("xmlns", "http://www.w3.org/2000/svg")
                .attr("width", String.valueOf(Math.round(LARGEUR_TOTALE)))
                .attr("height", String.valueOf(Math.round(hauteurSvg)))
                .attr("viewBox", "0 0 " + format(LARGEUR_TOTALE) + " " + format(hauteurSvg));

        double groupeHauteur = hauteurCategorie * 0.85;
        double itemGap = groupeHauteur * 0.05;
        double barHauteur = (groupeHauteur - 3 * itemGap) / SERIES.size();

        for (int i = 0; i < donnees.size(); i++) {
            RepartitionBean ligne = donnees.get(i);
            double yCategorie = i * hauteurCategorie + (hauteurCategorie - groupeHauteur) / 2;

            Element texteLabel = svg.appendElement("text")
                    .attr("x", format(LARGEUR_LABEL_CATEGORIE - 6))
                    .attr("y", format(yCategorie + groupeHauteur / 2))
                    .attr("text-anchor", "end")
                    .attr("dominant-baseline", "middle")
                    .attr("font-size", "9");
            texteLabel.text(ligne.getLibelle());

            double[] valeurs = {valeurMontant(ligne.getMontant()), ligne.getEffectif(), ligne.getStc(), valeurMontant(ligne.getStcMontant())};
            for (int s = 0; s < SERIES.size(); s++) {
                double y = yCategorie + s * (barHauteur + itemGap);
                double largeur = maxParSerie[s] <= 0 ? 0 : (valeurs[s] / maxParSerie[s]) * ECHELLE_MAX * LARGEUR_PLOT;

                if (largeur > 0) {
                    svg.appendElement("rect")
                            .attr("x", format(LARGEUR_LABEL_CATEGORIE))
                            .attr("y", format(y))
                            .attr("width", format(largeur))
                            .attr("height", format(barHauteur))
                            .attr("fill", SERIES.get(s).couleur());

                    String libelleValeur = s == 0 || s == 3
                            ? libelleMontant(s == 0 ? ligne.getMontant() : ligne.getStcMontant())
                            : PaieReportNumberFormat.entier((int) valeurs[s]);
                    svg.appendElement("text")
                            .attr("x", format(LARGEUR_LABEL_CATEGORIE + largeur + 4))
                            .attr("y", format(y + barHauteur / 2))
                            .attr("dominant-baseline", "middle")
                            .attr("font-size", "6")
                            .attr("font-weight", "bold")
                            .text(libelleValeur);
                }
            }
        }

        ajouterLegende(svg, hauteurPlot);
    }

    private void ajouterLegende(Element svg, double y) {
        double x = LARGEUR_LABEL_CATEGORIE;
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
