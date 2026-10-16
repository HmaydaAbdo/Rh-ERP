package staport.rh.paie.report;

import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.function.Function;

/** Construit les courbes mensuelles de la vue d'ensemble en SVG. */
@Component
final class RapportEvolutionSvgBuilder {

    private static final double LARGEUR = 802;
    private static final double HAUTEUR_MASSE = 226;
    private static final double HAUTEUR_INDICATEUR = 130;
    private static final double PX_PAR_PT = 4.0 / 3;
    private static final double X_GAUCHE = 82;
    private static final double X_DROITE = 14;
    private static final double Y_HAUT = 20;
    private static final String BLEU = "#2563EB";
    private static final String AXE = "#40566B";
    private static final String GRILLE = "#C8D3DE";
    private static final String REPERE = "#8298AA";

    void ajouterGraphique(Element corps, List<RepartitionBean> donnees, PageModel.MesureEvolution mesure) {
        Element container = corps.appendElement("div").addClass("evolution-container");
        if (donnees.isEmpty()) {
            ajouterIndisponible(container);
            return;
        }
        String unite;
        double hauteur;
        Function<RepartitionBean, BigDecimal> extraction;
        Function<BigDecimal, String> formateur;
        String couleur;
        String description;
        switch (mesure) {
            case MASSE -> {
                unite = "DH";
                hauteur = HAUTEUR_MASSE;
                extraction = RepartitionBean::getMontant;
                formateur = PaieReportNumberFormat::masse;
                couleur = BLEU;
                description = "Évolution mensuelle de la masse salariale en dirhams";
            }
            case EFFECTIF -> {
                unite = "personnes";
                hauteur = HAUTEUR_INDICATEUR;
                extraction = point -> BigDecimal.valueOf(point.getEffectif());
                formateur = this::formaterEntierArrondi;
                couleur = BLEU;
                description = "Évolution mensuelle de l'effectif en personnes";
            }
            case STC_PERSONNES -> {
                unite = "personnes";
                hauteur = HAUTEUR_INDICATEUR;
                extraction = point -> BigDecimal.valueOf(point.getStc());
                formateur = this::formaterEntierArrondi;
                couleur = "#D39118";
                description = "Évolution mensuelle du STC en personnes";
            }
            case STC_DH -> {
                unite = "DH";
                hauteur = HAUTEUR_INDICATEUR;
                extraction = RepartitionBean::getStcMontant;
                formateur = PaieReportNumberFormat::masse;
                couleur = "#0F8A78";
                description = "Évolution mensuelle du STC en dirhams";
            }
            default -> throw new IllegalStateException("Mesure d'évolution non gérée : " + mesure);
        }
        if (mesure != PageModel.MesureEvolution.MASSE) {
            container.addClass("compact");
        }
        Element svg = container.appendElement("svg", Parser.NamespaceSvg);
        construireCourbe(svg, donnees, unite, hauteur, extraction, formateur, couleur, description);
    }

    private void construireCourbe(Element svg, List<RepartitionBean> donnees, String unite, double hauteur,
                                  Function<RepartitionBean, BigDecimal> mesure,
                                  Function<BigDecimal, String> formateur, String couleur, String description) {
        double hauteurCourbe = hauteur - Y_HAUT - 34;
        double largeurCourbe = LARGEUR - X_GAUCHE - X_DROITE;
        List<BigDecimal> valeurs = donnees.stream().map(mesure).map(this::valeurOuZero).toList();
        double max = valeurs.stream().mapToDouble(BigDecimal::doubleValue).max().orElse(0);
        double echelleMax = max > 0 ? max * 1.18 : 1;
        double largeurSvg = LARGEUR * PX_PAR_PT;
        double hauteurSvg = hauteur * PX_PAR_PT;

        svg.attr("xmlns", "http://www.w3.org/2000/svg")
                .attr("role", "img")
                .attr("aria-label", description)
                .attr("width", format(largeurSvg) + "px")
                .attr("height", format(hauteurSvg) + "px")
                .attr("viewBox", "0 0 " + format(largeurSvg) + " " + format(hauteurSvg));
        Element dessin = svg.appendElement("g").attr("transform", "scale(" + PX_PAR_PT + ")");
        double xFin = LARGEUR - X_DROITE;
        double yBas = hauteur - 34;

        for (int tick = 0; tick <= 4; tick++) {
            double valeur = echelleMax * tick / 4;
            double y = Y_HAUT + hauteurCourbe * (1 - tick / 4.0);
            dessin.appendElement("line").attr("x1", format(X_GAUCHE)).attr("x2", format(xFin))
                    .attr("y1", format(y)).attr("y2", format(y))
                    .attr("stroke", GRILLE).attr("stroke-width", tick == 0 ? "0.8" : "0.65");
            dessin.appendElement("text").attr("x", format(X_GAUCHE - 9)).attr("y", format(y))
                    .attr("text-anchor", "end").attr("dominant-baseline", "middle")
                    .attr("font-size", "8").attr("fill", AXE)
                    .text(formateur.apply(BigDecimal.valueOf(valeur)));
        }

        // Des axes explicites et contrastés rendent les repères X/Y visibles dans le PDF imprimé.
        dessin.appendElement("line").attr("x1", format(X_GAUCHE)).attr("x2", format(X_GAUCHE))
                .attr("y1", format(Y_HAUT)).attr("y2", format(yBas))
                .attr("stroke", AXE).attr("stroke-width", "1.2");
        dessin.appendElement("line").attr("x1", format(X_GAUCHE)).attr("x2", format(xFin))
                .attr("y1", format(yBas)).attr("y2", format(yBas))
                .attr("stroke", AXE).attr("stroke-width", "1.2");

        double[] xs = new double[donnees.size()];
        double[] ys = new double[donnees.size()];
        StringBuilder chemin = new StringBuilder();
        for (int i = 0; i < donnees.size(); i++) {
            BigDecimal valeur = valeurs.get(i);
            double x = donnees.size() == 1 ? X_GAUCHE + largeurCourbe / 2
                    : X_GAUCHE + largeurCourbe * i / (donnees.size() - 1.0);
            double y = Y_HAUT + hauteurCourbe * (1 - valeur.doubleValue() / echelleMax);
            xs[i] = x;
            ys[i] = y;
            chemin.append(i == 0 ? "M " : " L ").append(format(x)).append(' ').append(format(y));
        }
        if (donnees.size() > 1) {
            dessin.appendElement("path").attr("d", chemin.toString()).attr("fill", "none")
                    .attr("stroke", couleur).attr("stroke-width", "2.1");
        }

        for (int i = 0; i < donnees.size(); i++) {
            RepartitionBean point = donnees.get(i);
            double x = xs[i];
            double y = ys[i];
            // Projection horizontale vers l'axe Y et verticale vers l'axe X.
            dessin.appendElement("line").attr("x1", format(X_GAUCHE)).attr("x2", format(x))
                    .attr("y1", format(y)).attr("y2", format(y))
                    .attr("stroke", REPERE).attr("stroke-width", "0.75").attr("stroke-dasharray", "2 2");
            dessin.appendElement("line").attr("x1", format(x)).attr("x2", format(x))
                    .attr("y1", format(y)).attr("y2", format(yBas))
                    .attr("stroke", REPERE).attr("stroke-width", "0.75").attr("stroke-dasharray", "2 2");
            dessin.appendElement("circle").attr("cx", format(x)).attr("cy", format(y))
                    .attr("r", "3.4").attr("fill", couleur).appendElement("title")
                    .text(point.getLibelle() + " : " + formateur.apply(valeurs.get(i)) + " " + unite);

            String texteValeur = formateur.apply(valeurs.get(i)) + ("DH".equals(unite) ? " DH" : " pers.");
            double decalage = i % 2 == 0 ? -8 : -19;
            dessin.appendElement("text").attr("x", format(x)).attr("y", format(y + decalage))
                    .attr("text-anchor", "middle").attr("font-size", "7.5").attr("font-weight", "bold")
                    .attr("fill", AXE).text(texteValeur);
            dessin.appendElement("text").attr("x", format(x)).attr("y", format(hauteur - 7))
                    .attr("text-anchor", "middle").attr("font-size", "8").attr("font-weight", "bold")
                    .attr("fill", AXE).text(point.getLibelle());
        }
    }

    private void ajouterIndisponible(Element container) {
        container.appendElement("p").addClass("evolution-indisponible")
                .text("Aucune donnée historique disponible pour le périmètre sélectionné.");
    }

    private BigDecimal valeurOuZero(BigDecimal valeur) {
        return valeur == null ? BigDecimal.ZERO : valeur;
    }

    private String formaterEntierArrondi(BigDecimal valeur) {
        return PaieReportNumberFormat.entier((int) Math.round(valeur.doubleValue()));
    }

    private String format(double valeur) {
        return String.valueOf(Math.round(valeur * 100) / 100.0);
    }
}
