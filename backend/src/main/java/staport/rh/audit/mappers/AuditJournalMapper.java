package staport.rh.audit.mappers;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import staport.rh.audit.dtos.response.AuditJournalDto;
import staport.rh.audit.dtos.response.AuditJournalLigneDto;
import staport.rh.audit.entities.AuditJournalEntry;

import java.util.Map;

@Mapper(componentModel = "spring")
public interface AuditJournalMapper {

    AuditJournalLigneDto toLigne(AuditJournalEntry entree);

    /** Le périmètre est stocké en JSON : le service le lit et le fournit déjà décodé. */
    @Mapping(target = "perimetre", source = "perimetre")
    AuditJournalDto toDto(AuditJournalEntry entree, Map<String, Object> perimetre);
}
