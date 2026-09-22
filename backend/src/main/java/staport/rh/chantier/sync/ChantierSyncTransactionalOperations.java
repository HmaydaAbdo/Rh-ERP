package staport.rh.chantier.sync;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.repositories.ChantierRepository;

/**
 * Chaque méthode s'exécute dans sa propre transaction, appelée depuis {@link ChantierSyncService}
 * (bean distinct — un appel interne à une méthode @Transactional de la même classe contournerait
 * le proxy Spring). Isoler chaque upsert dans sa propre transaction évite qu'un conflit sur une
 * ligne ERP invalide la session Hibernate pour le reste du lot.
 */
@Component
public class ChantierSyncTransactionalOperations {

    private final ChantierRepository repository;

    public ChantierSyncTransactionalOperations(ChantierRepository repository) {
        this.repository = repository;
    }

    /**
     * Réconciliation par {@code code} : id_chantier côté ERP n'est pas un identifiant fiable
     * par chantier (voir Chantier.sourceErp).
     */
    @Transactional
    public boolean upsert(ChantierErpDto record) {
        Chantier chantier = repository.findByCodeIgnoreCase(record.code()).orElseGet(Chantier::new);
        boolean isNew = chantier.getId() == null;

        chantier.setCode(record.code());
        chantier.setDesignation(record.designation());
        chantier.setSourceErp(true);
        // L'ERP n'expose aucun champ actif/statut (seulement id_chantier, code, designation,
        // CodeErreur) : on ne touche jamais actif sur une mise à jour, pour ne pas réactiver
        // silencieusement un chantier désactivé manuellement. Seule la création applique le défaut
        // actif=true (valeur par défaut de l'entité Chantier).
        if (isNew) {
            chantier.setActif(true);
        }

        repository.save(chantier);
        return isNew;
    }
}
