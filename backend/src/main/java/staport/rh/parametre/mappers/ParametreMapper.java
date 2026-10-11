package staport.rh.parametre.mappers;

import org.springframework.stereotype.Component;
import staport.rh.parametre.dtos.response.ParametreResponseDto;
import staport.rh.parametre.entities.CleParametre;
import staport.rh.parametre.entities.Parametre;

/** Fusionne la valeur stockée avec le catalogue de sa clé (libellé, type, bornes) : une conversion, sans logique métier. */
@Component
public class ParametreMapper {

    public ParametreResponseDto toDto(Parametre parametre, CleParametre cle) {
        return new ParametreResponseDto(parametre.getId(), parametre.getVersion(), cle.code(), cle.libelle(), cle.description(), cle.type(),
                cle.unite(), cle.minimum(), cle.maximum(), parametre.getValeur());
    }
}
