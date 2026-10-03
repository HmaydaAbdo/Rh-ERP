package staport.rh.equipe.mappers;

import org.mapstruct.Mapper;
import org.mapstruct.MappingTarget;
import staport.rh.equipe.dtos.request.EquipeCreateRequestDto;
import staport.rh.equipe.dtos.request.EquipeUpdateRequestDto;
import staport.rh.equipe.dtos.response.EquipeResponseDto;
import staport.rh.equipe.entities.Equipe;

@Mapper(componentModel = "spring")
public interface EquipeMapper {

    Equipe toEntity(EquipeCreateRequestDto dto);

    void updateEntityFromDto(EquipeUpdateRequestDto dto, @MappingTarget Equipe entity);

    EquipeResponseDto toDto(Equipe entity);
}
