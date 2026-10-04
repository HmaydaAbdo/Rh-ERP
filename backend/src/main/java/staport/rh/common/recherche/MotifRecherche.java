package staport.rh.common.recherche;

/**
 * Motif d'une recherche « contient, sans tenir compte de la casse » (conventions/security.md, « Recherches »).
 *
 * <p>Ce que tape l'utilisateur est du <em>texte</em>, jamais un motif : les jokers {@code %} et {@code _} (et le
 * caractère d'échappement lui-même) sont échappés, de sorte que « 100% » ne trouve que « 100% » et que « _ » ne
 * trouve que le tiret bas. Toute requête {@code LIKE} construite sur une saisie passe par ici et déclare
 * {@link #ECHAPPEMENT} comme caractère d'échappement ({@code criteriaBuilder.like(expression, motif, ECHAPPEMENT)} ou
 * {@code LIKE :motif ESCAPE '\'} en JPQL).
 */
public final class MotifRecherche {

    /** Le caractère d'échappement à déclarer avec le motif. */
    public static final char ECHAPPEMENT = '\\';

    private MotifRecherche() {
    }

    /** {@code %texte%} en minuscules, jokers échappés. Le texte doit être renseigné (les filtres vides sont ignorés en amont). */
    public static String contient(String texte) {
        String echappe = texte.toLowerCase()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + echappe + "%";
    }
}
