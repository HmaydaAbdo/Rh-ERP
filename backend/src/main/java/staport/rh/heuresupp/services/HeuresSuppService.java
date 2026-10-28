package staport.rh.heuresupp.services;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;
import staport.rh.heuresupp.dtos.response.HeureSuppResponseDto;
import staport.rh.heuresupp.mappers.HeuresSuppMapper;
import staport.rh.heuresupp.repositories.HeuresSuppRepository;
import staport.rh.heuresupp.services.interfaces.IHeuresSuppService;
import staport.rh.heuresupp.specifications.HeuresSuppSpecification;

@Service
public class HeuresSuppService implements IHeuresSuppService {

    private final HeuresSuppRepository repository;
    private final HeuresSuppMapper mapper;

    public HeuresSuppService(HeuresSuppRepository repository, HeuresSuppMapper mapper) {
        this.repository = repository;
        this.mapper = mapper;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<HeureSuppResponseDto> rechercher(HeuresSuppSearchCriteria criteres, Pageable pageable) {
        return repository.findAll(HeuresSuppSpecification.rechercher(criteres), pageable).map(mapper::toDto);
    }
}
