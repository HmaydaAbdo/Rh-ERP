package staport.rh.paie.reporting;

import java.util.List;
import java.util.Map;

/**
 * Catalogue du squelette "parc matériel" (CAMION ou ENGINS) — décision (HMAYDA, 2026-09-22) : sur le
 * chantier "C168", l'équipe "CH" reçoit un tableau CAMION, l'équipe "OP" un tableau ENGINS. Propre à
 * ce chantier uniquement, aucune règle générale identifiée pour les autres. Partagé entre l'export
 * Excel ({@code staport.rh.paie.export.PaieExportService}) et le rapport PDF
 * ({@code staport.rh.paie.report.PaieBiReportBuilder}) — les quantités du wizard sont reprises dans
 * les deux formats ; même règle métier (quel chantier/équipe, quels libellés), jamais dupliquée.
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

    /** Un tableau du parc matériel : le chantier et l'équipe qui le portent, son titre de colonne et ses lignes. */
    public record Tableau(String chantierCode, String equipeCode, String titre, List<String> libelles) {
    }

    /** Tous les tableaux prévus — l'assistant d'export les lit ici pour savoir quels nombres demander, sans dupliquer
     * la règle. */
    public static List<Tableau> tableaux() {
        return List.of(
                new Tableau(CHANTIER_MATERIEL, EQUIPE_CAMION, TITRE_CAMION, LIBELLES_CAMION),
                new Tableau(CHANTIER_MATERIEL, EQUIPE_ENGINS, TITRE_ENGINS, LIBELLES_ENGINS));
    }

    /** Nombre saisi pour une ligne du parc matériel, ou {@code null} si non renseigné. {@code nombres} peut être {@code null}. */
    public static Integer nombre(Map<String, Integer> nombres, String libelle) {
        return nombres == null ? null : nombres.get(libelle);
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
