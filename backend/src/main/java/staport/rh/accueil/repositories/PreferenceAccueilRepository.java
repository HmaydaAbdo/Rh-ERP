package staport.rh.accueil.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import staport.rh.accueil.entities.PreferenceAccueil;

import java.util.Optional;

@Repository
public interface PreferenceAccueilRepository extends JpaRepository<PreferenceAccueil, Long> {

    Optional<PreferenceAccueil> findByUtilisateurId(Long utilisateurId);
}
