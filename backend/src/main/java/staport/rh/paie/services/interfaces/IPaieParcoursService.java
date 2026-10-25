package staport.rh.paie.services.interfaces;

import staport.rh.paie.parcours.ParcoursEmployeDto;

/** Parcours d'un employé reconstitué depuis ses bulletins — façade publique de la Paie. */
public interface IPaieParcoursService {

    ParcoursEmployeDto parcours(Long employeId);
}
