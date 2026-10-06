package staport.rh.paie.report;

import org.springframework.core.io.ClassPathResource;

import java.awt.Font;
import java.awt.FontFormatException;
import java.awt.font.FontRenderContext;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Découpe un texte en lignes pour une largeur donnée, avec la police embarquée du rapport (Liberation Serif) —
 * l'estimation dont {@link RapportPageModelBuilder} et {@link RapportChartSvgBuilder} ont besoin pour que le
 * contenu d'une cellule passe à la ligne au lieu d'être tronqué (la hauteur d'une ligne de tableau ou de graphique
 * n'est plus fixe).
 *
 * <p>Même règle que le rendu CSS : retour à la ligne aux espaces (jamais aux espaces insécables, qui lient les
 * milliers d'un montant), et un mot plus large que la cellule est coupé n'importe où ({@code word-wrap:
 * break-word}). L'estimation penche volontairement du côté prudent ({@link #MARGE_LARGEUR}) : surestimer d'une
 * ligne laisse un peu de blanc en bas de page, la sous-estimer ferait déborder le contenu sous le pied de page.
 */
final class RapportMesureTexte {

    private static final String DOSSIER_FONTS = "report/paie/fonts/";

    /** Les mesures sont majorées de 3 % : écart possible entre les largeurs AWT et celles du moteur de rendu. */
    private static final double MARGE_LARGEUR = 1.03;

    private static final FontRenderContext CONTEXTE = new FontRenderContext(null, true, true);
    private static final Font REGULAR = charger("LiberationSerif-Regular.ttf");
    private static final Font BOLD = charger("LiberationSerif-Bold.ttf");

    private RapportMesureTexte() {
    }

    private static Font charger(String fichier) {
        try (InputStream flux = new ClassPathResource(DOSSIER_FONTS + fichier).getInputStream()) {
            return Font.createFont(Font.TRUETYPE_FONT, flux);
        } catch (IOException | FontFormatException e) {
            throw new IllegalStateException("Police embarquée du rapport PDF de paie introuvable ou invalide : " + fichier, e);
        }
    }

    /** @return au moins 1 (une cellule vide occupe une ligne) */
    static int lignes(String texte, double largeurPt, double taillePt, boolean gras) {
        return decouper(texte, largeurPt, taillePt, gras).size();
    }

    /** Largeur d'un texte sur une seule ligne, en pt (majorée, voir {@link #MARGE_LARGEUR}). */
    static double largeur(String texte, double taillePt, boolean gras) {
        return largeur(police(taillePt, gras), texte);
    }

    /** Les lignes du texte une fois passé à la ligne dans {@code largeurPt} — toujours au moins une (éventuellement
     * vide). */
    static List<String> decouper(String texte, double largeurPt, double taillePt, boolean gras) {
        List<String> lignes = new ArrayList<>();
        if (texte == null || texte.isBlank()) {
            lignes.add("");
            return lignes;
        }
        Font police = police(taillePt, gras);
        double espace = largeur(police, " ");
        StringBuilder courante = new StringBuilder();
        double largeurCourante = 0;
        for (String mot : texte.strip().split("\\s+")) {
            double largeurMot = largeur(police, mot);
            if (largeurMot > largeurPt) {
                // Mot plus large que la cellule : coupé caractère par caractère
                if (courante.length() > 0) {
                    lignes.add(courante.toString());
                    courante.setLength(0);
                    largeurCourante = 0;
                }
                for (int i = 0; i < mot.length(); ) {
                    int codePoint = mot.codePointAt(i);
                    String caractere = new String(Character.toChars(codePoint));
                    double largeurCaractere = largeur(police, caractere);
                    if (courante.length() > 0 && largeurCourante + largeurCaractere > largeurPt) {
                        lignes.add(courante.toString());
                        courante.setLength(0);
                        largeurCourante = 0;
                    }
                    courante.append(caractere);
                    largeurCourante += largeurCaractere;
                    i += Character.charCount(codePoint);
                }
            } else if (courante.length() == 0) {
                courante.append(mot);
                largeurCourante = largeurMot;
            } else if (largeurCourante + espace + largeurMot <= largeurPt) {
                courante.append(' ').append(mot);
                largeurCourante += espace + largeurMot;
            } else {
                lignes.add(courante.toString());
                courante.setLength(0);
                courante.append(mot);
                largeurCourante = largeurMot;
            }
        }
        lignes.add(courante.toString());
        return lignes;
    }

    private static Font police(double taillePt, boolean gras) {
        return (gras ? BOLD : REGULAR).deriveFont((float) taillePt);
    }

    private static double largeur(Font police, String texte) {
        return police.getStringBounds(texte, CONTEXTE).getWidth() * MARGE_LARGEUR;
    }
}
