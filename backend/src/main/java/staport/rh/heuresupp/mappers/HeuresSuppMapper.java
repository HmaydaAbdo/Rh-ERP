package staport.rh.heuresupp.mappers;

import org.springframework.stereotype.Component;
import staport.rh.heuresupp.dtos.response.HeureSuppResponseDto;
import staport.rh.heuresupp.entities.HeureSupp;

@Component
public class HeuresSuppMapper {

    public HeureSuppResponseDto toDto(HeureSupp entity) {
        return new HeureSuppResponseDto(
                entity.getId(), entity.getVersion(), entity.getEmployee().getId(), entity.getEmployee().getNomPrenom(),
                entity.getEmployee().getCin(), entity.getFonction().getId(), entity.getFonction().getLibelle(),
                entity.getChantier().getId(), entity.getChantier().getCode(), entity.getChantier().getNom(),
                entity.getPeriode(), entity.getSalaireReference(), entity.getTypeSalaireReference(),
                entity.getSalaireHoraire(), entity.getHeures(), entity.getMontant(), entity.isStcOuSortie(),
                entity.getStcDh(), entity.getForfait(), entity.getNetAPayer());
    }
}
