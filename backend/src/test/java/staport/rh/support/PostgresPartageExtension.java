package staport.rh.support;

import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.annotation.AnnotatedElementUtils;

/**
 * Démarre le PostgreSQL partagé avant la première classe de test qui charge l'application complète ({@code @SpringBootTest},
 * y compris par héritage). Les tests unitaires et les tranches web n'en ont pas besoin : ils ne déclenchent pas Docker.
 * Enregistrée automatiquement (voir {@code META-INF/services} et {@code junit-platform.properties}).
 */
public class PostgresPartageExtension implements BeforeAllCallback {

    @Override
    public void beforeAll(ExtensionContext contexte) {
        if (AnnotatedElementUtils.hasAnnotation(contexte.getRequiredTestClass(), SpringBootTest.class)) {
            PostgresPartage.demarrer();
        }
    }
}
