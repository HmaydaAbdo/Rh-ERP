package staport.rh.employee.mappers;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.request.EmployeeUpdateRequestDto;
import staport.rh.employee.dtos.response.ChantierSummaryDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.dtos.response.EquipeSummaryDto;
import staport.rh.employee.dtos.response.FunctionSummaryDto;
import staport.rh.employee.entities.Employee;
import staport.rh.equipe.entities.Equipe;
import staport.rh.function.entities.Function;

@Mapper(componentModel = "spring")
public interface EmployeeMapper {

    @Mapping(target = "fonction", ignore = true)
    @Mapping(target = "chantier", ignore = true)
    @Mapping(target = "equipe", ignore = true)
    Employee toEntity(EmployeeCreateRequestDto dto);

    @Mapping(target = "fonction", ignore = true)
    @Mapping(target = "chantier", ignore = true)
    @Mapping(target = "equipe", ignore = true)
    @Mapping(target = "version", ignore = true)
    void updateEntityFromDto(EmployeeUpdateRequestDto dto, @MappingTarget Employee entity);

    EmployeeResponseDto toDto(Employee entity);

    FunctionSummaryDto toSummaryDto(Function fonction);

    ChantierSummaryDto toSummaryDto(Chantier chantier);

    EquipeSummaryDto toSummaryDto(Equipe equipe);
}
