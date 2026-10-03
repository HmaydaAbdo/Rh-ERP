package staport.rh.chantier.sync;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.repositories.ChantierRepository;

/**
 * Chaque méthode s'exécute dans sa propre transaction, appelée depuis {@link ChantierSyncService}
 * (bean distinct — un appel interne à une méthode @Transactional de la même classe contournerait
 * le proxy Spring). Isoler chaque création dans sa propre transaction évite qu'un conflit sur une
 * ligne ERP invalide la session Hibernate pour le reste du lot.
 */
@Component
public class ChantierSyncTransactionalOperations {

    private final ChantierRepository repository;

    public ChantierSyncTransactionalOperations(ChantierRepository repository) {
        this.repository = repository;
    }

    /**
     * Crée le chantier si son {@code code} est absent, sinon ne touche à RIEN (décision du 2026-10-03 :
     * toute modification d'un chantier existant se fait depuis l'UI, la synchronisation ne fait
     * qu'ajouter les chantiers manquants). Rapprochement par {@code code}, insensible à la casse :
     * id_chantier côté ERP n'est pas un identifiant fiable par chantier (voir Chantier.sourceErp).
     *
     * @return {@code true} si un chantier a été créé, {@code false} s'il existait déjà (inchangé)
     */
    @Transactional
    public boolean creerSiAbsent(ChantierErpDto record) {
        if (repository.existsByCodeIgnoreCase(record.code())) {
            return false;
        }

        Chantier chantier = new Chantier();
        chantier.setCode(record.code());
        chantier.setDesignation(record.designation());
        chantier.setSourceErp(true);
        chantier.setActif(true);
        repository.save(chantier);
        return true;
    }
}
