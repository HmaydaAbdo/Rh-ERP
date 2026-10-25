package staport.rh.audit.services.interfaces;

import java.util.Map;

/**
 * Journal des appels d'outils MCP de l'assistant IA (docs/ia.md, § 5) : un appel est une consultation métier comme une
 * lecture HTTP, tracée avec l'utilisateur pour qui l'agent agit. Le périmètre ne contient que des valeurs bornées
 * (outil, identifiants, période) ; jamais d'argument libre ni de donnée personnelle.
 */
public interface IAuditOutilsAgent {

    /** Consultation servie. */
    void lectureServie(String outil, int nombreElements, Map<String, Object> perimetre);

    /** Appel refusé (permission absente) ou en échec ; {@code motif} est une raison courte et fixe. */
    void lectureRefusee(String outil, String motif);
}
