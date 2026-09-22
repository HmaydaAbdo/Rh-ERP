package staport.rh.paie.mappers;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.function.entities.Function;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.request.PaieUpdateRequestDto;
import staport.rh.paie.dtos.response.ChantierSummaryDto;
import staport.rh.paie.dtos.response.EmployeeSummaryDto;
import staport.rh.paie.dtos.response.FunctionSummaryDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.entities.Paie;

@Mapper(componentModel = "spring")
public interface PaieMapper {

    @Mapping(target = "employee", ignore = true)
    @Mapping(target = "fonction", ignore = true)
    @Mapping(target = "chantier", ignore = true)
    Paie toEntity(PaieCreateRequestDto dto);

    @Mapping(target = "fonction", ignore = true)
    @Mapping(target = "chantier", ignore = true)
    void updateEntityFromDto(PaieUpdateRequestDto dto, @MappingTarget Paie entity);

    PaieResponseDto toDto(Paie entity);

    EmployeeSummaryDto toSummaryDto(Employee employee);

    FunctionSummaryDto toSummaryDto(Function fonction);

    ChantierSummaryDto toSummaryDto(Chantier chantier);
}
