package staport.rh.audit.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import staport.rh.audit.entities.AuditJournalEntry;

public interface AuditJournalRepository extends JpaRepository<AuditJournalEntry, Long>, JpaSpecificationExecutor<AuditJournalEntry> {
}
