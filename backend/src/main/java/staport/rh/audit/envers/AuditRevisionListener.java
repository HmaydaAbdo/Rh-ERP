package staport.rh.audit.envers;

import org.hibernate.envers.RevisionListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import staport.rh.audit.context.ContexteAudit;
import staport.rh.audit.context.Origine;
import staport.rh.audit.context.ResolveurContexteAudit;
import staport.rh.audit.entities.AuditRevision;

/**
 * Renseigne chaque révision Envers (qui, d'où, identifiant de requête) au moment où elle est créée. Instancié par
 * Hibernate, pas par Spring : il ne dépend donc que de {@link ResolveurContexteAudit}, qui lit des contextes
 * statiques (traitement hors requête, utilisateur authentifié, requête courante).
 */
public class AuditRevisionListener implements RevisionListener {

    private static final Logger log = LoggerFactory.getLogger(AuditRevisionListener.class);

    @Override
    public void newRevision(Object revisionEntity) {
        AuditRevision revision = (AuditRevision) revisionEntity;
        ContexteAudit contexte = ResolveurContexteAudit.courant();
        revision.setUtilisateurId(contexte.utilisateurId());
        revision.setUtilisateurNom(contexte.utilisateurNom());
        revision.setOrigine(contexte.origine());
        revision.setRequestId(contexte.requestId());
        revision.setAdresseIp(contexte.adresseIp());
        if (contexte.origine() == Origine.INCONNUE) {
            log.warn("Révision d'audit créée hors de tout contexte (ni requête, ni traitement déclaré) : "
                    + "ouvrir un BatchAuditContext dans ce traitement");
        }
    }
}
