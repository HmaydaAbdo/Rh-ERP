package staport.rh.mcp.outils;

import org.springframework.data.domain.Sort;

/**
 * Sens d'un tri demandé par l'agent. Chaque outil de recherche ou de répartition expose son propre critère de tri
 * (énumération) et ce sens commun : l'agent compose lui-même « les dix plus gros salaires », « les chantiers par ordre
 * alphabétique », « les équipes les plus petites ».
 */
public enum SensTri {

    ASC,
    DESC;

    static final String DOC = "Sens du tri : ASC (croissant) ou DESC (décroissant). Absent = le sens par défaut du critère "
            + "(décroissant pour un montant ou un effectif, croissant pour un nom ou un code).";
    static final String PAGE_DOC = "Numéro de la page de résultats, à partir de 0 (0 par défaut). Avec `limite` comme taille "
            + "de page, permet de parcourir tous les résultats quand `total` dépasse ce qui est rendu.";

    /** Le sens demandé, sinon {@code defaut}. */
    static SensTri ou(SensTri demande, SensTri defaut) {
        return demande == null ? defaut : demande;
    }

    /** Tri Spring Data sur {@code propriete}, départagé par {@code secondaire} (ordre stable d'une page à l'autre). */
    Sort sur(String propriete, String secondaire) {
        Sort principal = this == ASC ? Sort.by(propriete).ascending() : Sort.by(propriete).descending();
        return propriete.equals(secondaire) ? principal : principal.and(Sort.by(secondaire).ascending());
    }
}
