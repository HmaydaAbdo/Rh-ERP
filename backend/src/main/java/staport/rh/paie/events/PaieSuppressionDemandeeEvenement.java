package staport.rh.paie.events;

import java.util.Collection;

/** Publié avant la suppression de bulletins ; un domaine dépendant peut la refuser en levant une exception. */
public record PaieSuppressionDemandeeEvenement(Collection<Long> paieIds) {
}
