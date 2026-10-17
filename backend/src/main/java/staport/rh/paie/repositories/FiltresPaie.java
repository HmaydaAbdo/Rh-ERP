package staport.rh.paie.repositories;

import staport.rh.common.recherche.MotifRecherche;
import staport.rh.paie.dtos.request.PaieSearchCriteria;

import java.util.List;

/**
 * Filtres de la barre de la page Paie, appliqués aux requêtes d'agrégation de {@link PaieRepository} (mois, chantiers,
 * tableau de bord). Ils lisent {@link PaieSearchCriteria} avec les mêmes règles que {@code PaieSpecification}, qui filtre
 * la liste : nom et CIN « contient » sans tenir compte de la casse (jokers échappés, {@link MotifRecherche}), identifiants multi-valeurs, un filtre vide ou absent
 * est ignoré. {@code equipeIds=0} sélectionne les bulletins sans équipe. Le mois n'en fait pas partie : chaque requête le traite à sa façon.
 *
 * <p>Lus par SpEL dans les {@code @Query} (d'où de vrais getters, pas un record). Un filtre ignoré porte {@code tous = true}
 * et une valeur factice : un {@code IN ()} vide n'est pas valide en SQL, et l'indicateur court-circuite de toute façon la
 * condition.
 */
public final class FiltresPaie {

    /** Aucun filtre : tout le périmètre. */
    public static final FiltresPaie AUCUN = new FiltresPaie(null, null, null, null, null);

    private static final List<Long> AUCUN_ID = List.of(-1L);

    private final boolean tousNoms;
    private final String motifNom;
    private final boolean tousCin;
    private final String motifCin;
    private final boolean tousChantiers;
    private final List<Long> chantierIds;
    private final boolean toutesFonctions;
    private final List<Long> fonctionIds;
    private final boolean toutesEquipes;
    private final boolean inclureSansEquipe;
    private final List<Long> equipeIds;

    public FiltresPaie(String nomPrenom, String cin, List<Long> chantierIds, List<Long> fonctionIds, List<Long> equipeIds) {
        this.tousNoms = estVide(nomPrenom);
        this.motifNom = tousNoms ? "%" : MotifRecherche.contient(nomPrenom);
        this.tousCin = estVide(cin);
        this.motifCin = tousCin ? "%" : MotifRecherche.contient(cin);
        this.tousChantiers = estVide(chantierIds);
        this.chantierIds = tousChantiers ? AUCUN_ID : List.copyOf(chantierIds);
        this.toutesFonctions = estVide(fonctionIds);
        this.fonctionIds = toutesFonctions ? AUCUN_ID : List.copyOf(fonctionIds);
        List<Long> equipes = equipeIds == null ? List.of() : equipeIds;
        this.inclureSansEquipe = equipes.contains(0L);
        List<Long> equipesAvecId = equipes.stream().filter(id -> id != null && id > 0).toList();
        this.toutesEquipes = equipesAvecId.isEmpty() && !inclureSansEquipe;
        this.equipeIds = equipesAvecId.isEmpty() ? AUCUN_ID : List.copyOf(equipesAvecId);
    }

    /** Les filtres d'une recherche ; {@code null} ou critères vides = {@link #AUCUN}. */
    public static FiltresPaie depuis(PaieSearchCriteria criteres) {
        return criteres == null
                ? AUCUN
                : new FiltresPaie(criteres.nomPrenom(), criteres.cin(), criteres.chantierIds(), criteres.fonctionIds(), criteres.equipeIds());
    }

    private static boolean estVide(String texte) {
        return texte == null || texte.isBlank();
    }

    private static boolean estVide(List<Long> ids) {
        return ids == null || ids.isEmpty();
    }

    public boolean isTousNoms() {
        return tousNoms;
    }

    public String getMotifNom() {
        return motifNom;
    }

    public boolean isTousCin() {
        return tousCin;
    }

    public String getMotifCin() {
        return motifCin;
    }

    public boolean isTousChantiers() {
        return tousChantiers;
    }

    public List<Long> getChantierIds() {
        return chantierIds;
    }

    public boolean isToutesFonctions() {
        return toutesFonctions;
    }

    public List<Long> getFonctionIds() {
        return fonctionIds;
    }

    public boolean isToutesEquipes() {
        return toutesEquipes;
    }

    /** Vrai quand la sélection inclut les bulletins dont l'équipe est absente. */
    public boolean isInclureSansEquipe() {
        return inclureSansEquipe;
    }

    public List<Long> getEquipeIds() {
        return equipeIds;
    }
}
