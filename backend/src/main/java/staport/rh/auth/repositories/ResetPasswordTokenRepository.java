package staport.rh.auth.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import staport.rh.auth.entities.ResetPasswordToken;

import java.util.Optional;

public interface ResetPasswordTokenRepository extends JpaRepository<ResetPasswordToken, Long> {

    Optional<ResetPasswordToken> findByTokenHash(String tokenHash);
}
