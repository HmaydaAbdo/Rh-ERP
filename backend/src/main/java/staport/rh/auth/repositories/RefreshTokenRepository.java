package staport.rh.auth.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import staport.rh.auth.entities.RefreshToken;

import java.util.List;
import java.util.Optional;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    List<RefreshToken> findAllByUtilisateur_IdAndRevoqueFalse(Long utilisateurId);

    List<RefreshToken> findAllByFamilleAndRevoqueFalse(String famille);
}
