package staport.rh.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

/** Active {@code @Async} (exécuteur de Spring Boot) : l'envoi d'un courriel ne ralentit jamais la réponse d'une requête. */
@Configuration
@EnableAsync
public class AsyncConfig {
}
