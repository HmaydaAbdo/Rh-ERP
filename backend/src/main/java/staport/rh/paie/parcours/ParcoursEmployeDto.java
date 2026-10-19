package staport.rh.paie.parcours;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

/**
 * Le parcours d'un employé, tel que ses bulletins le racontent (voir docs/adr/0010-employe-etat-du-dernier-mois-de-paie.md) :
 * quelques indicateurs, ses mois de paie et les événements qui s'en déduisent, du plus récent au plus ancien.
 */
public record ParcoursEmployeDto(
        long employeId,
        Indicateurs indicateurs,
        List<MoisDto> mois,
        List<EvenementDto> evenements
) {

    /** {@code premierMois}/{@code dernierMois} sont {@code null} pour un employé sans aucun bulletin. */
    public record Indicateurs(int moisPayes, BigDecimal totalPercu, BigDecimal joursTravailles, YearMonth premierMois,
                              YearMonth dernierMois) {
    }

    /** Un mois de paie : la photo du bulletin (fonction, chantier et équipe du mois). */
    public record MoisDto(long bulletinId, YearMonth periode, String fonction, String chantier, String equipe,
                          BigDecimal nombreJoursTravailles, BigDecimal salaireMensuel, BigDecimal salaireTotal,
                          String observation) {
    }

    /**
     * Un changement dans le parcours, au mois où la paie le constate. {@code avant}/{@code apres} pour les changements
     * d'affectation ou de salaire ; {@code motif} pour un départ.
     */
    public record EvenementDto(YearMonth periode, TypeEvenement type, String avant, String apres, String motif) {
    }

    public enum TypeEvenement {
        /** Première paie de l'employé. */
        ENTREE,
        CHANGEMENT_CHANTIER,
        CHANGEMENT_FONCTION,
        CHANGEMENT_EQUIPE,
        CHANGEMENT_SALAIRE,
        /** Départ de l'entreprise (STC, ou absence confirmée à l'import). */
        DEPART,
        /** Une paie après un départ : l'employé est revenu. */
        RETOUR
    }
}
