package staport.rh.heuresupp.services;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import staport.rh.heuresupp.entities.HeureSupp;
import staport.rh.heuresupp.repositories.HeuresSuppRepository;
import staport.rh.paie.reporting.ObservationStc;
import staport.rh.paie.events.PaieModifieeEvenement;
import staport.rh.paie.events.PaieSuppressionDemandeeEvenement;
import staport.rh.paie.exceptions.PaieLieeException;

import java.math.BigDecimal;

/**
 * Les lignes d'heures supplémentaires suivent leur bulletin : une modification du marqueur STC/sortie recalcule STC et
 * Net à payer (le forfait, interdit en STC/sortie, est annulé) ; la suppression d'un bulletin lié est refusée.
 * Les écouteurs s'exécutent dans la transaction de la paie, donc tout est annulé ensemble en cas d'échec.
 */
@Component
public class EcouteurPaieHeuresSupp {

    private final HeuresSuppRepository repository;

    public EcouteurPaieHeuresSupp(HeuresSuppRepository repository) {
        this.repository = repository;
    }

    @EventListener
    public void paieModifiee(PaieModifieeEvenement evenement) {
        boolean stc = ObservationStc.estStcOuSortie(evenement.observation());
        for (HeureSupp ligne : repository.findByPaie_Id(evenement.paieId())) {
            if (ligne.isStcOuSortie() == stc) continue;
            ligne.setStcOuSortie(stc);
            if (stc) ligne.setForfait(null);
            ligne.setStcDh(CalculHeuresSupp.stcDh(ligne.getMontant(), stc));
            ligne.setNetAPayer(CalculHeuresSupp.netAPayer(ligne.getMontant(), ligne.getStcDh(), ligne.getForfait()));
            repository.save(ligne);
        }
    }

    @EventListener
    public void suppressionDemandee(PaieSuppressionDemandeeEvenement evenement) {
        if (evenement.paieIds().isEmpty()) return;
        long liees = repository.countByPaie_IdIn(evenement.paieIds());
        if (liees > 0) {
            throw new PaieLieeException(liees == 1
                    ? "Suppression impossible : une ligne d'heures supplémentaires s'appuie sur ce bulletin. Supprimez-la d'abord."
                    : "Suppression impossible : " + liees + " lignes d'heures supplémentaires s'appuient sur ces bulletins. Supprimez-les d'abord.");
        }
    }
}
