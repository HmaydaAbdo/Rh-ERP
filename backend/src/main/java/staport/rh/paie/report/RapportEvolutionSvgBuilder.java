package staport.rh.paie.report;

import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.function.Function;

/** Construit les graphiques mensuels à deux séries et une échelle commune en SVG pour le rapport PDF. */
@Component
final class RapportEvolutionSvgBuilder {

    private static final double LARGEUR = 802;
    static final double HAUTEUR_COMPACTE = 170;
    private static final double PX_PAR_PT = 4.0 / 3;
    private static final double X_GAUCHE = 82;
    private static final double X_DROITE = 82;
    private static final double Y_HAUT = 25;
    private static final double Y_BAS_MARGE = 43;
    private static final String AXE = "#40566B";
    private static final String GRILLE = "#C8D3DE";

    private record Serie(String nom, String unite, String couleur,
                         Function<RepartitionBean, BigDecimal> extraction,
                         Function<BigDecimal, String> format) {
    }

    void ajouterGraphique(Element corps, List<RepartitionBean> donnees, PageModel.GroupeEvolution groupe,
                          double hauteur) {
        Element container = corps.appendElement("div").addClass("evolution-container");
        container.attr("style", "height:" + format(hauteur) + "pt");
        if (donnees.isEmpty()) {
            container.appendElement("p").addClass("evolution-indisponible")
                    .text("Aucune donnée historique disponible pour le périmètre sélectionné.");
            return;
        }

        List<Serie> series = series(groupe);
        Element svg = container.appendElement("svg", Parser.NamespaceSvg);
        String description = series.get(0).nom() + " et " + series.get(1).nom()
                + ", évolution mensuelle sur les périodes disponibles";
        construire(svg, donnees, series, description, hauteur);
    }

    private List<Serie> series(PageModel.GroupeEvolution groupe) {
        return switch (groupe) {
            case MONTANTS -> List.of(
                    new Serie("Masse salariale", "DH", "#2563EB", RepartitionBean::getMontant,
                            PaieReportNumberFormat::masse),
                    new Serie("Montants des STC", "DH", "#0F766E", RepartitionBean::getStcMontant,
                            PaieReportNumberFormat::masse));
            case EFFECTIFS -> List.of(
                    new Serie("Effectif rémunéré", "personnes", "#D97706",
                            point -> BigDecimal.valueOf(point.getEffectif()), this::formaterEntier),
                    new Serie("Sorties du personnel (STC)", "personnes", "#B91C1C",
                            point -> BigDecimal.valueOf(point.getStc()), this::formaterEntier));
        };
    }

    private void construire(Element svg, List<RepartitionBean> donnees, List<Serie> series, String description,
                            double hauteur) {
        double xDebut = X_GAUCHE;
        double xFin = LARGEUR - X_DROITE;
        double yBas = hauteur - Y_BAS_MARGE;
        double hauteurTrace = yBas - Y_HAUT;
        double largeurTrace = xFin - xDebut;
        List<List<BigDecimal>> valeurs = series.stream().map(serie -> donnees.stream()
                .map(serie.extraction()).map(this::valeurOuZero).toList()).toList();
        double maximum = echelleMax(valeurs.stream().flatMap(List::stream)
                .mapToDouble(BigDecimal::doubleValue).max().orElse(0));

        svg.attr("xmlns", "http://www.w3.org/2000/svg")
                .attr("role", "img")
                .attr("aria-label", description)
                .attr("width", format(LARGEUR * PX_PAR_PT) + "px")
                .attr("height", format(hauteur * PX_PAR_PT) + "px")
                .attr("viewBox", "0 0 " + format(LARGEUR * PX_PAR_PT) + " " + format(hauteur * PX_PAR_PT));
        Element dessin = svg.appendElement("g").attr("transform", "scale(" + PX_PAR_PT + ")");

        ajouterLegende(dessin, series);
        for (int tick = 0; tick <= 4; tick++) {
            double proportion = tick / 4.0;
            double y = yBas - hauteurTrace * proportion;
            dessin.appendElement("line").attr("x1", format(xDebut)).attr("x2", format(xFin))
                    .attr("y1", format(y)).attr("y2", format(y))
                    .attr("stroke", GRILLE).attr("stroke-width", tick == 0 ? "0.8" : "0.55");
            double valeur = maximum * proportion;
            String texte = series.get(0).format().apply(BigDecimal.valueOf(valeur));
            dessin.appendElement("text").attr("x", format(xDebut - 8)).attr("y", format(y))
                    .attr("text-anchor", "end").attr("dominant-baseline", "middle").attr("font-size", "7.1")
                    .attr("fill", AXE).text(texte);
        }

        ajouterTitreAxe(dessin, series.get(0).unite(), xDebut - 64, (Y_HAUT + yBas) / 2);
        dessin.appendElement("line").attr("x1", format(xDebut)).attr("x2", format(xDebut))
                .attr("y1", format(Y_HAUT)).attr("y2", format(yBas)).attr("stroke", AXE).attr("stroke-width", "1");
        dessin.appendElement("line").attr("x1", format(xDebut)).attr("x2", format(xFin))
                .attr("y1", format(yBas)).attr("y2", format(yBas)).attr("stroke", AXE).attr("stroke-width", "1");

        double[][] positionsEtiquettes = positionsEtiquettes(valeurs, maximum, yBas, hauteurTrace);
        for (int s = 0; s < series.size(); s++) {
            ajouterSerie(dessin, donnees, series.get(s), valeurs.get(s), maximum, s,
                    xDebut, largeurTrace, yBas, hauteurTrace, positionsEtiquettes[s]);
        }
    }

    private void ajouterSerie(Element dessin, List<RepartitionBean> donnees, Serie serie, List<BigDecimal> valeurs,
                              double maximum, int indexSerie, double xDebut, double largeurTrace,
                              double yBas, double hauteurTrace, double[] positionsEtiquettes) {
        StringBuilder chemin = new StringBuilder();
        for (int i = 0; i < donnees.size(); i++) {
            double x = abscisse(i, donnees.size(), xDebut, largeurTrace);
            double y = ordonnee(valeurs.get(i), maximum, yBas, hauteurTrace);
            chemin.append(i == 0 ? "M " : " L ").append(format(x)).append(' ').append(format(y));
        }
        if (donnees.size() > 1) {
            dessin.appendElement("path").attr("d", chemin.toString()).attr("fill", "none")
                    .attr("stroke", serie.couleur()).attr("stroke-width", "2.1");
        }

        for (int i = 0; i < donnees.size(); i++) {
            RepartitionBean point = donnees.get(i);
            double x = abscisse(i, donnees.size(), xDebut, largeurTrace);
            double y = ordonnee(valeurs.get(i), maximum, yBas, hauteurTrace);
            // Chaque point est projeté vers l'unique axe de valeur et vers l'axe des mois.
            dessin.appendElement("line").attr("x1", format(xDebut))
                    .attr("x2", format(x))
                    .attr("y1", format(y)).attr("y2", format(y))
                    .attr("stroke", serie.couleur()).attr("stroke-opacity", "0.48")
                    .attr("stroke-width", "0.7").attr("stroke-dasharray", "2 2");
            dessin.appendElement("line").attr("x1", format(x)).attr("x2", format(x))
                    .attr("y1", format(y)).attr("y2", format(yBas))
                    .attr("stroke", serie.couleur()).attr("stroke-opacity", "0.48")
                    .attr("stroke-width", "0.7").attr("stroke-dasharray", "2 2");
            dessin.appendElement("circle").attr("cx", format(x)).attr("cy", format(y))
                    .attr("r", "3.1").attr("fill", serie.couleur()).attr("stroke", "#FFFFFF")
                    .attr("stroke-width", "0.8").appendElement("title")
                    .text(point.getLibelle() + " — " + serie.nom() + " : "
                            + serie.format().apply(valeurs.get(i)) + " " + serie.unite());
            double decalageHorizontal = i == 0 ? 14 : i == donnees.size() - 1 ? -14 : 0;
            dessin.appendElement("text").addClass("evolution-valeur")
                    .attr("data-index", String.valueOf(i)).attr("data-serie", String.valueOf(indexSerie))
                    .attr("x", format(x + decalageHorizontal)).attr("y", format(positionsEtiquettes[i]))
                    .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
                    .attr("font-size", "7.2").attr("font-weight", "bold")
                    // Batik/OpenHTMLToPDF dessine parfois le contour SVG au-dessus du remplissage,
                    // ce qui rendait ces valeurs entièrement blanches dans le PDF. Les étiquettes
                    // restent lisibles grâce à leur couleur de série et à leur position décalée.
                    .attr("fill", serie.couleur()).text(serie.format().apply(valeurs.get(i)));
            if (indexSerie == 0) {
                dessin.appendElement("text").attr("x", format(x)).attr("y", format(yBas + 15))
                        .attr("text-anchor", "middle").attr("font-size", "8").attr("font-weight", "bold")
                        .attr("fill", AXE).text(point.getLibelle());
            }
        }
    }

    /** Écarte les valeurs mensuelles lorsque les deux séries partagent une position proche. */
    private double[][] positionsEtiquettes(List<List<BigDecimal>> valeurs, double maximum,
                                           double yBas, double hauteurTrace) {
        double[][] positions = new double[2][valeurs.get(0).size()];
        for (int i = 0; i < valeurs.get(0).size(); i++) {
            double[] points = new double[2];
            for (int s = 0; s < 2; s++) {
                points[s] = ordonnee(valeurs.get(s).get(i), maximum, yBas, hauteurTrace);
            }
            double minY = Y_HAUT + 7;
            double maxY = yBas - 4;
            double meilleureCout = Double.POSITIVE_INFINITY;
            double[] decalages = {-11, 12, -18, 19};
            for (double d0 : decalages) {
                for (double d1 : decalages) {
                    double y0 = Math.max(minY, Math.min(maxY, points[0] + d0));
                    double y1 = Math.max(minY, Math.min(maxY, points[1] + d1));
                    if (Math.abs(y0 - y1) < 9) {
                        continue;
                    }
                    double cout = Math.abs(y0 - points[0]) + Math.abs(y1 - points[1]);
                    if ((d0 < 0) == (d1 < 0)) {
                        cout += 18;
                    }
                    if (cout < meilleureCout) {
                        meilleureCout = cout;
                        positions[0][i] = y0;
                        positions[1][i] = y1;
                    }
                }
            }
            if (meilleureCout == Double.POSITIVE_INFINITY) {
                positions[0][i] = Math.max(minY, Math.min(maxY, points[0] - 18));
                positions[1][i] = Math.max(minY, Math.min(maxY, points[1] + 19));
            }
        }
        return positions;
    }

    private void ajouterLegende(Element dessin, List<Serie> series) {
        double milieu = LARGEUR / 2;
        double[] centres = {milieu - 95, milieu + 95};
        for (int i = 0; i < series.size(); i++) {
            Serie serie = series.get(i);
            double x = centres[i];
            dessin.appendElement("line").attr("x1", format(x - 68)).attr("x2", format(x - 52))
                    .attr("y1", "9").attr("y2", "9").attr("stroke", serie.couleur()).attr("stroke-width", "2.1");
            dessin.appendElement("circle").attr("cx", format(x - 60)).attr("cy", "9").attr("r", "2.5")
                    .attr("fill", serie.couleur());
            dessin.appendElement("text").attr("x", format(x - 46)).attr("y", "9")
                    .attr("dominant-baseline", "middle").attr("font-size", "8")
                    .attr("font-weight", "bold").attr("fill", serie.couleur())
                    .text(serie.nom() + " · " + serie.unite());
        }
    }

    private void ajouterTitreAxe(Element dessin, String unite, double x, double y) {
        dessin.appendElement("text").attr("x", format(x)).attr("y", format(y))
                .attr("text-anchor", "middle").attr("font-size", "8").attr("font-weight", "bold")
                .attr("fill", AXE)
                .attr("transform", "rotate(-90 " + format(x) + " " + format(y) + ")")
                .text(unite);
    }

    private double echelleMax(double maximum) {
        if (maximum <= 0) {
            return 1;
        }
        double ordre = Math.pow(10, Math.floor(Math.log10(maximum)));
        double normalise = maximum / ordre;
        double palier = normalise <= 1 ? 1 : normalise <= 2 ? 2 : normalise <= 5 ? 5 : 10;
        return palier * ordre;
    }

    private double abscisse(int index, int nombre, double debut, double largeur) {
        return nombre == 1 ? debut + largeur / 2 : debut + largeur * index / (nombre - 1.0);
    }

    private double ordonnee(BigDecimal valeur, double maximum, double bas, double hauteur) {
        return bas - hauteur * valeur.doubleValue() / maximum;
    }

    private BigDecimal valeurOuZero(BigDecimal valeur) {
        return valeur == null ? BigDecimal.ZERO : valeur;
    }

    private String formaterEntier(BigDecimal valeur) {
        return PaieReportNumberFormat.entier(valeur.setScale(0, RoundingMode.HALF_UP).intValue());
    }

    private String format(double valeur) {
        return String.valueOf(Math.round(valeur * 100) / 100.0);
    }
}
