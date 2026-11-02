package staport.rh.paie.events;

/** Publié dans la transaction qui modifie un bulletin, pour que les domaines qui s'y appuient se recalculent. */
public record PaieModifieeEvenement(Long paieId, String observation) {
}
