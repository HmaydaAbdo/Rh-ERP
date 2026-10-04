package staport.rh.audit.support;

import jakarta.persistence.EntityManager;
import org.springframework.transaction.support.TransactionTemplate;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.equipe.entities.Equipe;
import staport.rh.function.entities.Function;
import staport.rh.paie.entities.Paie;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;

/**
 * Données de test pour les tests d'intégration de l'audit : chaque appel crée ses lignes sous un suffixe unique et
 * les <strong>valide</strong> (les révisions d'Envers n'existent qu'au commit, une transaction annulée n'en laisse
 * aucune). Les tests filtrent donc toujours par identifiant, jamais par comptage global de la base.
 */
public class DonneesDeTest {

    /** Un employé et ses références, prêts à recevoir des bulletins. */
    public record Referentiel(long fonctionId, long chantierId, long equipeId, long employeId, String suffixe) {
    }

    private final TransactionTemplate transaction;
    private final EntityManager entityManager;

    public DonneesDeTest(TransactionTemplate transaction, EntityManager entityManager) {
        this.transaction = transaction;
        this.entityManager = entityManager;
    }

    public static String suffixeUnique() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    public Referentiel creerReferentiel() {
        String s = suffixeUnique();
        return transaction.execute(statut -> {
            Function fonction = new Function();
            fonction.setLibelle("F-" + s);
            entityManager.persist(fonction);
            Chantier chantier = new Chantier();
            chantier.setCode("C-" + s);
            entityManager.persist(chantier);
            Equipe equipe = new Equipe();
            equipe.setCode("E" + s);
            equipe.setLibelle("Equipe " + s);
            entityManager.persist(equipe);
            Employee employe = new Employee();
            employe.setNomPrenom("Nom " + s);
            employe.setCin("CIN" + s);
            employe.setDateNaissance(LocalDate.of(1990, 1, 1));
            employe.setDateEmbauche(LocalDate.of(2020, 1, 1));
            employe.setFonction(fonction);
            employe.setChantier(chantier);
            entityManager.persist(employe);
            return new Referentiel(fonction.getId(), chantier.getId(), equipe.getId(), employe.getId(), s);
        });
    }

    /** Crée un bulletin pour l'employé du référentiel, dans sa propre transaction, et retourne son identifiant. */
    public long creerBulletin(Referentiel ref, YearMonth periode) {
        return transaction.execute(statut -> {
            Paie paie = nouveauBulletin(ref, periode);
            entityManager.persist(paie);
            return paie.getId();
        });
    }

    /** Un bulletin non persisté, pour les tests qui l'enregistrent eux-mêmes. */
    public Paie nouveauBulletin(Referentiel ref, YearMonth periode) {
        Paie paie = new Paie();
        paie.setEmployee(entityManager.getReference(Employee.class, ref.employeId()));
        paie.setPeriode(periode);
        paie.setFonction(entityManager.getReference(Function.class, ref.fonctionId()));
        paie.setChantier(entityManager.getReference(Chantier.class, ref.chantierId()));
        paie.setEquipe(entityManager.getReference(Equipe.class, ref.equipeId()));
        paie.setNombreJoursTravailles(26);
        paie.setSalaireMensuel(new BigDecimal("3000.00"));
        paie.setSalaireTotal(new BigDecimal("3000.00"));
        return paie;
    }
}
