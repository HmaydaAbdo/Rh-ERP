package staport.rh.paie.imports;

import staport.rh.employee.entities.TypeSalaire;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

/**
 * Ce que l'analyse d'un fichier de paie a trouvé, sans rien enregistrer. Le fichier ne s'importe que {@code pret} : aucune
 * erreur, aucun chantier clôturé, aucun CIN inconnu, aucun écart avec les fiches. {@code departs} et {@code retours} ne bloquent pas : ce sont les
 * changements de statut que l'import appliquera (les départs, seulement ceux que l'utilisateur confirme).
 */
public record PaieImportAnalyseDto(
        YearMonth periode,
        int totalLignes,
        List<ErreurDto> erreurs,
        List<ChantierClotureDto> chantiersClotures,
        List<CinInconnuDto> cinInconnus,
        List<EcartDto> ecarts,
        List<DepartDto> departs,
        List<RetourDto> retours,
        boolean pret
) {

    /** Une ligne que seul le fichier peut corriger (champ manquant, valeur invalide, référence inconnue…). */
    public record ErreurDto(int numeroLigne, String cin, String nomPrenom, String raison) {
    }

    /** Un chantier clôturé que des lignes citent : à rouvrir (domaine Chantier), ou à corriger dans le fichier. */
    public record ChantierClotureDto(long chantierId, String code, String designation, List<Integer> lignes) {
    }

    /** Un CIN sans fiche : à créer depuis l'assistant (avec les dates que le fichier n'a pas), ou à corriger dans le fichier. */
    public record CinInconnuDto(int numeroLigne, String cin, String nomPrenom, String fonction, String chantier, String equipe,
                                BigDecimal salaire) {
    }

    /**
     * Une fiche qui ne dit pas la même chose que sa ligne : à mettre à jour depuis l'assistant, ou à corriger dans le fichier.
     * {@code typeSalaire} est le type actuel de la fiche (à confirmer ou changer quand le salaire change).
     */
    public record EcartDto(long employeId, int numeroLigne, String cin, String nomPrenom, List<ChampDto> champs,
                           TypeSalaire typeSalaire) {
    }

    /** Un champ en écart : sa valeur dans la fiche, puis dans le fichier. Codes : nomPrenom, fonction, chantier, equipe, salaire. */
    public record ChampDto(String champ, String base, String fichier) {
    }

    /** Un employé qui quitte l'entreprise : STC ou sortie dans le fichier ({@code motif} « STC » ou « Sortie »), ou actif absent du fichier ({@code motif} null). */
    public record DepartDto(long employeId, String cin, String nomPrenom, String motif) {
    }

    /** Un employé inactif présent dans le fichier : l'import le repasse ACTIF. */
    public record RetourDto(long employeId, String cin, String nomPrenom) {
    }
}
