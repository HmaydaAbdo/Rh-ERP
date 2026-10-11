package staport.rh.chantier.mappers;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import staport.rh.chantier.dtos.request.ChantierCreateRequestDto;
import staport.rh.chantier.dtos.request.ChantierUpdateRequestDto;
import staport.rh.chantier.dtos.response.ChantierResponseDto;
import staport.rh.chantier.entities.Chantier;

@Mapper(componentModel = "spring")
public interface ChantierMapper {

    Chantier toEntity(ChantierCreateRequestDto dto);

    @Mapping(target = "version", ignore = true)
    void updateEntityFromDto(ChantierUpdateRequestDto dto, @MappingTarget Chantier entity);

    ChantierResponseDto toDto(Chantier entity);
}
