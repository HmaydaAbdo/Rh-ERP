package staport.rh.paie.reporting;

import java.util.List;

/**
 * Catalogue du squelette "parc matériel" (CAMION ou ENGINS) — décision (HMAYDA, 2026-09-22) : sur le
 * chantier "C168", l'équipe "CH" reçoit un tableau CAMION, l'équipe "OP" un tableau ENGINS. Propre à
 * ce chantier uniquement, aucune règle générale identifiée pour les autres. Partagé entre l'export
 * Excel ({@code staport.rh.paie.export.PaieExportService}, colonne "Nbre" éditable à la main dans le
 * classeur) et le rapport PDF ({@code staport.rh.paie.report.PaieBiReportBuilder}, colonne vide,
 * destinée à être remplie au stylo sur le document imprimé, demande explicite de direction,
 * 2026-09-29) — même règle métier (quel chantier/équipe, quels libellés), jamais dupliquée entre les
 * deux formats ; seule la présentation de la colonne "Nbre" diffère, ce qui reste du ressort de
 * chaque format.
 */
public final class MaterielChantierCatalogue {

    private static final String CHANTIER_MATERIEL = "C168";
    private static final String EQUIPE_CAMION = "CH";
    private static final String EQUIPE_ENGINS = "OP";
    public static final String TITRE_CAMION = "CAMION";
    public static final String TITRE_ENGINS = "ENGINS";
    private static final List<String> LIBELLES_CAMION = List.of(
            "CAMION CITERNE", "CAMION 8*4", "CAMION SR", "PORT CHAR", "PICK UP");
    private static final List<String> LIBELLES_ENGINS = List.of(
            "PELLE PNEU", "PELLE CHENILLE", "NIVELEUSE", "COMPACTEURS", "CHARGEUR", "BULL", "TRACTOPELLE");

    private MaterielChantierCatalogue() {
    }

    /** Libellés du squelette matériel de ce chantier/équipe, ou liste vide si aucun cas prévu.
     * Comparaison insensible à la casse et aux espaces superflus. */
    public static List<String> libelles(String chantierCode, String equipe) {
        String titre = titre(chantierCode, equipe);
        if (TITRE_CAMION.equals(titre)) {
            return LIBELLES_CAMION;
        }
        if (TITRE_ENGINS.equals(titre)) {
            return LIBELLES_ENGINS;
        }
        return List.of();
    }

    /** Titre de colonne ("CAMION"/"ENGINS") du squelette matériel de ce chantier/équipe, ou
     * {@code null} si aucun cas prévu. */
    public static String titre(String chantierCode, String equipe) {
        if (chantierCode == null || equipe == null || !chantierCode.trim().equalsIgnoreCase(CHANTIER_MATERIEL)) {
            return null;
        }
        String equipeNormalisee = equipe.trim();
        if (equipeNormalisee.equalsIgnoreCase(EQUIPE_CAMION)) {
            return TITRE_CAMION;
        }
        if (equipeNormalisee.equalsIgnoreCase(EQUIPE_ENGINS)) {
            return TITRE_ENGINS;
        }
        return null;
    }
}
