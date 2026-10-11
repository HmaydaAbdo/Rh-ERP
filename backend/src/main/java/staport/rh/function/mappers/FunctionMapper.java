package staport.rh.function.mappers;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import staport.rh.function.dtos.request.FunctionCreateRequestDto;
import staport.rh.function.dtos.request.FunctionUpdateRequestDto;
import staport.rh.function.dtos.response.FunctionResponseDto;
import staport.rh.function.entities.Function;

@Mapper(componentModel = "spring")
public interface FunctionMapper {

    Function toEntity(FunctionCreateRequestDto dto);

    @Mapping(target = "version", ignore = true)
    void updateEntityFromDto(FunctionUpdateRequestDto dto, @MappingTarget Function entity);

    FunctionResponseDto toDto(Function entity);
}
