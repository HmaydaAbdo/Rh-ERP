package staport.rh.paie.report;

import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.function.Function;

/** Construit les graphiques mensuels à deux séries et deux axes en SVG pour le rapport PDF. */
@Component
final class RapportEvolutionSvgBuilder {

    private static final double LARGEUR = 802;
    private static final double HAUTEUR = 226;
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

    void ajouterGraphique(Element corps, List<RepartitionBean> donnees, PageModel.GroupeEvolution groupe) {
        Element container = corps.appendElement("div").addClass("evolution-container");
        if (donnees.isEmpty()) {
            container.appendElement("p").addClass("evolution-indisponible")
                    .text("Aucune donnée historique disponible pour le périmètre sélectionné.");
            return;
        }

        List<Serie> series = series(groupe);
        Element svg = container.appendElement("svg", Parser.NamespaceSvg);
        String description = series.get(0).nom() + " et " + series.get(1).nom()
                + ", évolution mensuelle sur les périodes disponibles";
        construire(svg, donnees, series, description);
    }

    private List<Serie> series(PageModel.GroupeEvolution groupe) {
        return switch (groupe) {
            case MASSE_EFFECTIF -> List.of(
                    new Serie("Masse salariale", "DH", "#2563EB", RepartitionBean::getMontant,
                            PaieReportNumberFormat::masse),
                    new Serie("Effectif", "personnes", "#D97706",
                            point -> BigDecimal.valueOf(point.getEffectif()), this::formaterEntier));
            case STC -> List.of(
                    new Serie("STC", "personnes", "#B91C1C",
                            point -> BigDecimal.valueOf(point.getStc()), this::formaterEntier),
                    new Serie("STC", "DH", "#0F766E", RepartitionBean::getStcMontant,
                            PaieReportNumberFormat::masse));
        };
    }

    private void construire(Element svg, List<RepartitionBean> donnees, List<Serie> series, String description) {
        double xDebut = X_GAUCHE;
        double xFin = LARGEUR - X_DROITE;
        double yBas = HAUTEUR - Y_BAS_MARGE;
        double hauteurTrace = yBas - Y_HAUT;
        double largeurTrace = xFin - xDebut;
        List<List<BigDecimal>> valeurs = series.stream().map(serie -> donnees.stream()
                .map(serie.extraction()).map(this::valeurOuZero).toList()).toList();
        double[] maximums = valeurs.stream().mapToDouble(v -> v.stream()
                .mapToDouble(BigDecimal::doubleValue).max().orElse(0)).map(this::echelleMax).toArray();

        svg.attr("xmlns", "http://www.w3.org/2000/svg")
                .attr("role", "img")
                .attr("aria-label", description)
                .attr("width", format(LARGEUR * PX_PAR_PT) + "px")
                .attr("height", format(HAUTEUR * PX_PAR_PT) + "px")
                .attr("viewBox", "0 0 " + format(LARGEUR * PX_PAR_PT) + " " + format(HAUTEUR * PX_PAR_PT));
        Element dessin = svg.appendElement("g").attr("transform", "scale(" + PX_PAR_PT + ")");

        ajouterLegende(dessin, series);
        for (int tick = 0; tick <= 4; tick++) {
            double proportion = tick / 4.0;
            double y = yBas - hauteurTrace * proportion;
            dessin.appendElement("line").attr("x1", format(xDebut)).attr("x2", format(xFin))
                    .attr("y1", format(y)).attr("y2", format(y))
                    .attr("stroke", GRILLE).attr("stroke-width", tick == 0 ? "0.8" : "0.55");
            for (int s = 0; s < series.size(); s++) {
                double valeur = maximums[s] * proportion;
                String texte = series.get(s).format().apply(BigDecimal.valueOf(valeur));
                double x = s == 0 ? xDebut - 8 : xFin + 8;
                dessin.appendElement("text").attr("x", format(x)).attr("y", format(y))
                        .attr("text-anchor", s == 0 ? "end" : "start")
                        .attr("dominant-baseline", "middle").attr("font-size", "7.1")
                        .attr("fill", series.get(s).couleur()).text(texte);
            }
        }

        // Les unités sont écrites aux deux axes : les nombres et les échelles de DH/personnes restent distincts.
        ajouterTitreAxe(dessin, series.get(0), xDebut - 64, (Y_HAUT + yBas) / 2, -90);
        ajouterTitreAxe(dessin, series.get(1), xFin + 72, (Y_HAUT + yBas) / 2, 90);
        dessin.appendElement("line").attr("x1", format(xDebut)).attr("x2", format(xDebut))
                .attr("y1", format(Y_HAUT)).attr("y2", format(yBas)).attr("stroke", AXE).attr("stroke-width", "1");
        dessin.appendElement("line").attr("x1", format(xFin)).attr("x2", format(xFin))
                .attr("y1", format(Y_HAUT)).attr("y2", format(yBas)).attr("stroke", AXE).attr("stroke-width", "1");
        dessin.appendElement("line").attr("x1", format(xDebut)).attr("x2", format(xFin))
                .attr("y1", format(yBas)).attr("y2", format(yBas)).attr("stroke", AXE).attr("stroke-width", "1");

        for (int s = 0; s < series.size(); s++) {
            ajouterSerie(dessin, donnees, series.get(s), valeurs.get(s), maximums[s], s,
                    xDebut, largeurTrace, yBas, hauteurTrace);
        }
    }

    private void ajouterSerie(Element dessin, List<RepartitionBean> donnees, Serie serie, List<BigDecimal> valeurs,
                              double maximum, int indexSerie, double xDebut, double largeurTrace,
                              double yBas, double hauteurTrace) {
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
            // Chaque série est projetée vers son axe de valeur et vers l'axe des mois.
            dessin.appendElement("line").attr("x1", format(indexSerie == 0 ? xDebut : x))
                    .attr("x2", format(indexSerie == 0 ? x : LARGEUR - X_DROITE))
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
            double decalage = indexSerie == 0 ? -8 : 12;
            double yLibelle = Math.max(Y_HAUT + 7, Math.min(yBas - 4, y + decalage));
            dessin.appendElement("text").attr("x", format(x)).attr("y", format(yLibelle))
                    .attr("text-anchor", "middle").attr("font-size", "6.8").attr("font-weight", "bold")
                    .attr("fill", serie.couleur()).text(serie.format().apply(valeurs.get(i)));
            if (indexSerie == 0) {
                dessin.appendElement("text").attr("x", format(x)).attr("y", format(yBas + 15))
                        .attr("text-anchor", "middle").attr("font-size", "8").attr("font-weight", "bold")
                        .attr("fill", AXE).text(point.getLibelle());
            }
        }
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

    private void ajouterTitreAxe(Element dessin, Serie serie, double x, double y, int rotation) {
        dessin.appendElement("text").attr("x", format(x)).attr("y", format(y))
                .attr("text-anchor", "middle").attr("font-size", "8").attr("font-weight", "bold")
                .attr("fill", serie.couleur())
                .attr("transform", "rotate(" + rotation + " " + format(x) + " " + format(y) + ")")
                .text(serie.nom() + " (" + serie.unite() + ")");
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
