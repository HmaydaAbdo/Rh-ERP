package staport.rh.paie.repositories;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import staport.rh.paie.entities.Paie;

import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

@Repository
public interface PaieRepository extends JpaRepository<Paie, Long>, JpaSpecificationExecutor<Paie> {

    @EntityGraph(attributePaths = {"employee", "fonction", "chantier"})
    @Query("SELECT p FROM Paie p WHERE p.id = :id")
    Optional<Paie> findWithReferencesById(Long id);

    @EntityGraph(attributePaths = {"employee", "fonction", "chantier"})
    @Override
    Page<Paie> findAll(org.springframework.data.jpa.domain.Specification<Paie> spec, Pageable pageable);

    boolean existsByEmployee_IdAndPeriode(Long employeeId, YearMonth periode);

    Optional<Paie> findByEmployee_IdAndPeriode(Long employeeId, YearMonth periode);

    @EntityGraph(attributePaths = {"employee", "fonction", "chantier"})
    List<Paie> findByPeriode(YearMonth periode);

    @Query("SELECT DISTINCT p.equipe FROM Paie p " +
            "WHERE p.chantier.code = :chantierCode AND p.periode = :periode " +
            "AND p.equipe IS NOT NULL AND p.equipe <> '' " +
            "ORDER BY p.equipe")
    List<String> findDistinctEquipesByChantierCodeAndPeriode(@Param("chantierCode") String chantierCode,
                                                               @Param("periode") YearMonth periode);

    /** Masse, effectif et STC/sorties agrégés par (chantier, équipe, mois) sur l'intervalle
     * {@code [debut, fin]} — alimente les 3 niveaux d'évolution du rapport PDF (global, par chantier,
     * par équipe — voir {@code PaieBiReportBuilder.evolutionParNiveau}). **Une seule requête pour les
     * 3 niveaux** — pas une requête par chantier ni par équipe (25 chantiers × plusieurs équipes × 12
     * mois ferait des centaines d'allers-retours base pour la même fenêtre de données) : le global et
     * le chantier sont simplement une somme en Java du même jeu de lignes déjà groupé au niveau le
     * plus fin, jamais un second appel base. Agrégation faite en base (pas un chargement des entités
     * `Paie` complètes suivi d'une somme en Java) : seule la tendance importe ici, jamais le détail
     * employé d'un mois passé — l'index existant sur {@code periode} (voir l'entité `Paie`) suffit à
     * borner la fenêtre ; un index composite dédié n'est pas justifié pour une requête de génération
     * de rapport, pas un chemin d'accès chaud. Le décompte STC reproduit exactement
     * {@code ObservationStc.estStcOuSortie} (comparaison insensible à la casse/espaces à "stc" ou
     * "sortie") directement en JPQL, plutôt que de recharger les `Paie` complètes pour appliquer le
     * prédicat Java — même donnée, même définition, jamais dupliquée ni divergente. */
    @Query("SELECT p.chantier.code AS chantierCode, p.equipe AS equipe, p.periode AS periode, " +
            "SUM(p.salaireTotal) AS masse, COUNT(p) AS effectif, " +
            "SUM(CASE WHEN LOWER(TRIM(p.observation)) IN ('stc', 'sortie') THEN 1 ELSE 0 END) AS stc, " +
            "SUM(CASE WHEN LOWER(TRIM(p.observation)) IN ('stc', 'sortie') THEN p.salaireTotal ELSE 0 END) AS stcMontant " +
            "FROM Paie p WHERE p.periode BETWEEN :debut AND :fin " +
            "GROUP BY p.chantier.code, p.equipe, p.periode")
    List<EvolutionChantierEquipeProjection> sommerParChantierEquipePeriode(@Param("debut") YearMonth debut, @Param("fin") YearMonth fin);

    /** Mois le plus ancien pour lequel une paie existe, toutes périodes confondues — sert à ne pas
     * afficher de mois "fantômes" antérieurs à la mise en place du système sur les graphiques
     * d'évolution (voir {@code PaieBiReportBuilder.evolutionParNiveau}) : la fenêtre glissante de 12
     * mois ne démarre jamais avant ce mois, même si la période demandée le permettrait. {@code
     * Optional.empty()} seulement si la table est vide (jamais atteint en pratique : le rapport lève
     * déjà {@code AucunePaiePeriodeException} avant d'en arriver là). */
    @Query("SELECT MIN(p.periode) FROM Paie p")
    Optional<YearMonth> premierePeriode();
}
