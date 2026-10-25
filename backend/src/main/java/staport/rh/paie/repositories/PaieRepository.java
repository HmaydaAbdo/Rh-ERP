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

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Repository
public interface PaieRepository extends JpaRepository<Paie, Long>, JpaSpecificationExecutor<Paie> {

    /** Fragment WHERE commun : un filtre est ignoré quand son indicateur « tous » est vrai (voir {@link FiltresPaie}).
     * Pour les équipes, l'identifiant {@code 0} inclut les bulletins dont la relation est {@code NULL}. */
    String FILTRES = " AND (:#{#f.tousNoms} = true OR LOWER(p.employee.nomPrenom) LIKE :#{#f.motifNom} ESCAPE '\\')" +
            " AND (:#{#f.tousCin} = true OR LOWER(p.employee.cin) LIKE :#{#f.motifCin} ESCAPE '\\')" +
            " AND (:#{#f.tousChantiers} = true OR p.chantier.id IN :#{#f.chantierIds})" +
            " AND (:#{#f.toutesFonctions} = true OR p.fonction.id IN :#{#f.fonctionIds})" +
            " AND (:#{#f.toutesEquipes} = true OR (:#{#f.inclureSansEquipe} = true AND p.equipe IS NULL) OR p.equipe.id IN :#{#f.equipeIds})";

    /** Même définition du STC que {@code ObservationStc.estStcOuSortie}, comme dans les requêtes ci-dessus. */
    String EST_STC = "LOWER(TRIM(p.observation)) IN ('stc', 'sortie')";

    @EntityGraph(attributePaths = {"employee", "fonction", "chantier", "equipe"})
    @Query("SELECT p FROM Paie p WHERE p.id = :id")
    Optional<Paie> findWithReferencesById(Long id);

    @EntityGraph(attributePaths = {"employee", "fonction", "chantier", "equipe"})
    @Override
    Page<Paie> findAll(org.springframework.data.jpa.domain.Specification<Paie> spec, Pageable pageable);

    /** Sans pagination (rapport PDF, suppression en groupe) : les références sont chargées avec les bulletins, jamais après. */
    @EntityGraph(attributePaths = {"employee", "fonction", "chantier", "equipe"})
    @Override
    List<Paie> findAll(org.springframework.data.jpa.domain.Specification<Paie> spec);

    boolean existsByEmployee_IdAndPeriode(Long employeeId, YearMonth periode);

    @Query("SELECT p.employee.id FROM Paie p WHERE p.periode = :periode AND p.employee.id IN :employeeIds")
    Set<Long> findEmployeeIdsByPeriodeAndEmployees(@Param("periode") YearMonth periode,
                                                   @Param("employeeIds") Set<Long> employeeIds);

    /** Employés qui ont déjà un bulletin pour cette période — l'import ne modifie jamais un bulletin
     * existant (modification depuis l'écran Paie uniquement). */
    @Query("SELECT p.employee.id FROM Paie p WHERE p.periode = :periode")
    Set<Long> findEmployeeIdsByPeriode(@Param("periode") YearMonth periode);

    /** Le dernier mois importé ({@code null} sans aucune paie) : l'import n'accepte que le mois qui le suit. */
    @Query("SELECT MAX(p.periode) FROM Paie p")
    YearMonth findDernierePeriode();

    @EntityGraph(attributePaths = {"employee", "fonction", "chantier", "equipe"})
    List<Paie> findByPeriode(YearMonth periode);

    /** Tous les bulletins réduits à qui, quand et où (tendances des effectifs) ; cinq colonnes, aucune entité chargée. */
    @Query("SELECT p.employee.id AS employeId, p.periode AS periode, p.chantier.id AS chantierId, p.fonction.id AS fonctionId, "
            + "e.id AS equipeId FROM Paie p LEFT JOIN p.equipe e WHERE 1 = 1" + FILTRES + " ORDER BY p.periode")
    List<EffectifBulletinProjection> listerEffectifs(@Param("f") FiltresPaie filtres);

    /** Les bulletins d'un employé, du plus ancien au plus récent : son parcours. */
    @EntityGraph(attributePaths = {"fonction", "chantier", "equipe"})
    List<Paie> findByEmployee_IdOrderByPeriodeAsc(Long employeeId);

    /** Un résumé par mois qui contient de la paie, du plus récent au plus ancien — une seule requête groupée,
     * pour que l'assistant d'export et la vue Cartes connaissent d'un coup les mois disponibles et leur contenu (sur le périmètre filtré, ou {@link FiltresPaie#AUCUN}). Le décompte STC
     * reproduit {@code ObservationStc.estStcOuSortie} en JPQL (même définition que le rapport). */
    @Query("SELECT p.periode AS periode, COUNT(p) AS bulletins, COUNT(DISTINCT p.chantier.id) AS chantiers, " +
            "SUM(p.salaireTotal) AS masse, " +
            "SUM(CASE WHEN " + EST_STC + " THEN 1 ELSE 0 END) AS stc, " +
            "SUM(CASE WHEN " + EST_STC + " THEN p.salaireTotal ELSE 0 END) AS stcMontant " +
            "FROM Paie p WHERE 1 = 1" + FILTRES + " GROUP BY p.periode ORDER BY p.periode DESC")
    List<PaiePeriodeProjection> resumerParPeriode(@Param("f") FiltresPaie f);

    /** Effectif et masse de chaque couple (chantier, équipe) d'un mois sur le périmètre filtré — une seule requête pour toute
     * l'étape « détail par équipe » de l'assistant d'export et pour les niveaux chantier et équipe de la vue Cartes. */
    @Query("SELECT c.id AS chantierId, c.code AS chantierCode, c.nom AS chantierNom, c.designation AS chantierDesignation, " +
            "e.id AS equipeId, e.code AS equipeCode, e.libelle AS equipeLibelle, " +
            "COUNT(p) AS effectif, SUM(p.salaireTotal) AS masse, " +
            "SUM(CASE WHEN " + EST_STC + " THEN 1 ELSE 0 END) AS stc, " +
            "SUM(CASE WHEN " + EST_STC + " THEN p.salaireTotal ELSE 0 END) AS stcMontant " +
            "FROM Paie p JOIN p.chantier c LEFT JOIN p.equipe e WHERE p.periode = :periode" + FILTRES +
            " GROUP BY c.id, c.code, c.nom, c.designation, e.id, e.code, e.libelle")
    List<ChantierEquipePeriodeProjection> resumerChantiersEtEquipesParPeriode(@Param("periode") YearMonth periode, @Param("f") FiltresPaie f);

    /** Page des chantiers ayant au moins un bulletin pour le mois, tri stable par code. */
    @Query(value = "SELECT DISTINCT c.id AS id, c.code AS code, c.nom AS nom, c.designation AS designation, c.actif AS actif " +
            "FROM Paie p JOIN p.chantier c WHERE p.periode = :periode " +
            "AND (:motif IS NULL OR LOWER(c.code) LIKE :motif ESCAPE '\\' " +
            "OR LOWER(COALESCE(c.nom, '')) LIKE :motif ESCAPE '\\' " +
            "OR LOWER(COALESCE(c.designation, '')) LIKE :motif ESCAPE '\\') ORDER BY c.code ASC",
            countQuery = "SELECT COUNT(DISTINCT c.id) FROM Paie p JOIN p.chantier c " +
                    "WHERE p.periode = :periode AND (:motif IS NULL OR LOWER(c.code) LIKE :motif ESCAPE '\\' " +
                    "OR LOWER(COALESCE(c.nom, '')) LIKE :motif ESCAPE '\\' " +
                    "OR LOWER(COALESCE(c.designation, '')) LIKE :motif ESCAPE '\\')")
    Page<PaieChantierOptionProjection> rechercherOptionsChantiers(@Param("periode") YearMonth periode,
                                                                  @Param("motif") String motif,
                                                                  Pageable pageable);

    /** Page des équipes ayant des bulletins sur au moins un des chantiers sélectionnés ce mois. */
    @Query(value = "SELECT DISTINCT e.id AS id, e.code AS code, e.libelle AS libelle " +
            "FROM Paie p JOIN p.equipe e WHERE p.periode = :periode AND p.chantier.id IN :chantierIds " +
            "AND (:motif IS NULL OR LOWER(e.code) LIKE :motif ESCAPE '\\' " +
            "OR LOWER(e.libelle) LIKE :motif ESCAPE '\\') ORDER BY e.code ASC",
            countQuery = "SELECT COUNT(DISTINCT e.id) FROM Paie p JOIN p.equipe e " +
                    "WHERE p.periode = :periode AND p.chantier.id IN :chantierIds " +
                    "AND (:motif IS NULL OR LOWER(e.code) LIKE :motif ESCAPE '\\' " +
                    "OR LOWER(e.libelle) LIKE :motif ESCAPE '\\')")
    Page<PaieEquipeOptionProjection> rechercherOptionsEquipes(@Param("periode") YearMonth periode,
                                                              @Param("chantierIds") List<Long> chantierIds,
                                                              @Param("motif") String motif,
                                                              Pageable pageable);

    /** Masse, effectif et STC/sorties agrégés par (chantier, équipe, mois) sur l'intervalle
     * {@code [debut, fin]} — alimente l'évolution globale et, ultérieurement si retenu, par chantier
     * (voir {@code PaieBiReportBuilder.evolutionParNiveau}). Une seule requête pour les deux niveaux
     * — pas une requête par chantier ni par équipe (25 chantiers × plusieurs équipes × 12
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
    @Query("SELECT p.chantier.id AS chantierId, p.chantier.code AS chantierCode, e.code AS equipe, p.periode AS periode, " +
            "SUM(p.salaireTotal) AS masse, COUNT(p) AS effectif, " +
            "SUM(CASE WHEN LOWER(TRIM(p.observation)) IN ('stc', 'sortie') THEN 1 ELSE 0 END) AS stc, " +
            "SUM(CASE WHEN LOWER(TRIM(p.observation)) IN ('stc', 'sortie') THEN p.salaireTotal ELSE 0 END) AS stcMontant " +
            "FROM Paie p LEFT JOIN p.equipe e WHERE p.periode BETWEEN :debut AND :fin " + FILTRES +
            "GROUP BY p.chantier.id, p.chantier.code, e.code, p.periode")
    List<EvolutionChantierEquipeProjection> sommerParChantierEquipePeriode(@Param("debut") YearMonth debut,
                                                                         @Param("fin") YearMonth fin,
                                                                         @Param("f") FiltresPaie filtres);

    // ---- Tableau de bord analytique : mêmes filtres multi-valeurs pour toutes les requêtes ci-dessous ----

    /** Les indicateurs d'un mois sur le périmètre filtré — une seule ligne, même sans bulletin (effectif 0). */
    @Query("SELECT COUNT(p) AS effectif, COALESCE(SUM(p.salaireTotal), 0) AS masse, " +
            "COUNT(DISTINCT p.chantier.id) AS chantiers, " +
            "COALESCE(SUM(CASE WHEN " + EST_STC + " THEN 1 ELSE 0 END), 0) AS stc, " +
            "COALESCE(SUM(CASE WHEN " + EST_STC + " THEN p.salaireTotal ELSE 0 END), 0) AS stcMontant, " +
            "COALESCE(SUM(CASE WHEN p.equipe IS NULL THEN 1 ELSE 0 END), 0) AS sansEquipe, " +
            "COALESCE(SUM(CASE WHEN p.observation IS NULL OR TRIM(p.observation) = '' THEN 1 ELSE 0 END), 0) AS sansObservation " +
            "FROM Paie p WHERE p.periode = :periode" + FILTRES)
    PaieKpiProjection resumerKpi(@Param("periode") YearMonth periode, @Param("f") FiltresPaie f);

    /** Masse, effectif et STC par chantier, du plus gros au plus petit. */
    @Query("SELECT c.id AS id, c.code AS code, c.nom AS nom, c.designation AS designation, " +
            "SUM(p.salaireTotal) AS masse, COUNT(p) AS effectif, " +
            "SUM(CASE WHEN " + EST_STC + " THEN 1 ELSE 0 END) AS stc, " +
            "SUM(CASE WHEN " + EST_STC + " THEN p.salaireTotal ELSE 0 END) AS stcMontant " +
            "FROM Paie p JOIN p.chantier c WHERE p.periode = :periode" + FILTRES +
            " GROUP BY c.id, c.code, c.nom, c.designation ORDER BY SUM(p.salaireTotal) DESC")
    List<ChantierMasseProjection> sommerParChantier(@Param("periode") YearMonth periode, @Param("f") FiltresPaie f);

    /** Masse, effectif et STC par équipe, du plus gros au plus petit ; une ligne {@code NULL} représente « Sans équipe ». */
    @Query("SELECT e.id AS id, e.code AS code, e.libelle AS libelle, " +
            "SUM(p.salaireTotal) AS masse, COUNT(p) AS effectif, " +
            "SUM(CASE WHEN " + EST_STC + " THEN 1 ELSE 0 END) AS stc, " +
            "SUM(CASE WHEN " + EST_STC + " THEN p.salaireTotal ELSE 0 END) AS stcMontant " +
            "FROM Paie p LEFT JOIN p.equipe e WHERE p.periode = :periode" + FILTRES +
            " GROUP BY e.id, e.code, e.libelle ORDER BY SUM(p.salaireTotal) DESC")
    List<EquipeMasseProjection> sommerParEquipe(@Param("periode") YearMonth periode, @Param("f") FiltresPaie f);

    /** Masse, effectif et STC par fonction, de la plus grosse à la plus petite. */
    @Query("SELECT f.id AS id, f.libelle AS libelle, SUM(p.salaireTotal) AS masse, COUNT(p) AS effectif, " +
            "SUM(CASE WHEN " + EST_STC + " THEN 1 ELSE 0 END) AS stc, " +
            "SUM(CASE WHEN " + EST_STC + " THEN p.salaireTotal ELSE 0 END) AS stcMontant " +
            "FROM Paie p JOIN p.fonction f WHERE p.periode = :periode" + FILTRES +
            " GROUP BY f.id, f.libelle ORDER BY SUM(p.salaireTotal) DESC")
    List<FonctionMasseProjection> sommerParFonction(@Param("periode") YearMonth periode, @Param("f") FiltresPaie f);

    /** Masse et effectif de **chaque** mois qui contient de la paie dans le périmètre (tout l'historique, sans fenêtre),
     * du plus ancien au plus récent. */
    @Query("SELECT p.periode AS periode, SUM(p.salaireTotal) AS masse, COUNT(p) AS effectif, " +
            "SUM(CASE WHEN " + EST_STC + " THEN 1 ELSE 0 END) AS stc, " +
            "SUM(CASE WHEN " + EST_STC + " THEN p.salaireTotal ELSE 0 END) AS stcMontant " +
            "FROM Paie p WHERE 1 = 1" + FILTRES +
            " GROUP BY p.periode ORDER BY p.periode")
    List<EvolutionMasseProjection> sommerParPeriode(@Param("f") FiltresPaie f);

    /** Le {@code salaireTotal} de chaque bulletin du mois sur le périmètre filtré — répartition par tranche. */
    @Query("SELECT p.salaireTotal FROM Paie p WHERE p.periode = :periode" + FILTRES)
    List<BigDecimal> listerTotaux(@Param("periode") YearMonth periode, @Param("f") FiltresPaie f);
}
