package staport.rh.paie.repositories;

public interface PaieChantierOptionProjection {
    Long getId();
    String getCode();
    String getNom();
    String getDesignation();
    boolean getActif();
}
