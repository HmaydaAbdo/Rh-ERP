package staport.rh.common.logging;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LogbackConfigurationTest {

    @Test
    void le_json_ne_sort_que_le_request_id_du_mdc() throws IOException {
        String configuration = ressource("logback-json.xml");

        assertEquals(2, occurrences(configuration, "<includeMdcKeyName>requestId</includeMdcKeyName>"));
        assertFalse(configuration.contains("userId"));
        assertTrue(configuration.contains("<customFields>{\"application\":\"${APPLICATION}\"}</customFields>"));
    }

    @Test
    void les_archives_texte_et_json_sont_quotidiennes_utc_et_gardees_trente_jours() throws IOException {
        for (String fichier : new String[]{"logback-text.xml", "logback-json.xml"}) {
            String configuration = ressource(fichier);
            assertTrue(configuration.contains("%d{yyyy-MM-dd, UTC}"), fichier);
            assertTrue(configuration.contains("<maxHistory>30</maxHistory>"), fichier);
            assertTrue(configuration.contains("<cleanHistoryOnStart>true</cleanHistoryOnStart>"), fichier);
        }
    }

    private static String ressource(String nom) throws IOException {
        try (InputStream entree = LogbackConfigurationTest.class.getClassLoader().getResourceAsStream(nom)) {
            if (entree == null) {
                throw new IOException("Ressource introuvable : " + nom);
            }
            return new String(entree.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static int occurrences(String texte, String valeur) {
        return (texte.length() - texte.replace(valeur, "").length()) / valeur.length();
    }
}
