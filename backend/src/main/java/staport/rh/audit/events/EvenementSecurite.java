package staport.rh.audit.events;

import java.util.Map;

/**
 * Événement de sécurité publié (événement Spring) par le service qui le connaît — jamais écrit par lui : un seul
 * écouteur, {@link EcouteurEvenementsSecurite}, l'inscrit dans le journal d'audit.
 *
 * @param utilisateurId  compte concerné, {@code null} s'il n'y en a pas (ou si c'est l'utilisateur authentifié, que
 *                       l'écouteur retrouve dans le contexte)
 * @param utilisateurNom identifiant de connexion du compte concerné — <strong>seulement s'il correspond à un compte</strong>
 *                       (un identifiant inconnu peut être un mot de passe tapé au mauvais endroit)
 * @param motif          raison courte et fixe (ex. {@code COMPTE_INACTIF}), jamais une donnée saisie
 * @param details        compléments sans donnée personnelle (nombre de sessions révoquées, route refusée…)
 */
public record EvenementSecurite(ActionSecurite action, Long utilisateurId, String utilisateurNom, String motif,
                                Map<String, Object> details) {

    public static EvenementSecurite de(ActionSecurite action) {
        return new EvenementSecurite(action, null, null, null, null);
    }

    public static EvenementSecurite pour(ActionSecurite action, Long utilisateurId, String utilisateurNom) {
        return new EvenementSecurite(action, utilisateurId, utilisateurNom, null, null);
    }

    public static EvenementSecurite avecMotif(ActionSecurite action, Long utilisateurId, String utilisateurNom, String motif) {
        return new EvenementSecurite(action, utilisateurId, utilisateurNom, motif, null);
    }

    public static EvenementSecurite avecDetails(ActionSecurite action, Long utilisateurId, String utilisateurNom,
                                                Map<String, Object> details) {
        return new EvenementSecurite(action, utilisateurId, utilisateurNom, null, details);
    }
}
