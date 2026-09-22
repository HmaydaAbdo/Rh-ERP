package staport.rh.auth.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.auth.dtos.request.RoleCreateRequestDto;
import staport.rh.auth.dtos.request.RoleUpdateRequestDto;
import staport.rh.auth.dtos.response.PermissionResponseDto;
import staport.rh.auth.dtos.response.RoleResponseDto;
import staport.rh.auth.entities.Permission;
import staport.rh.auth.entities.Role;
import staport.rh.auth.exceptions.RoleAlreadyExistsException;
import staport.rh.auth.exceptions.RoleNotFoundException;
import staport.rh.auth.exceptions.UnknownPermissionException;
import staport.rh.auth.mappers.RoleMapper;
import staport.rh.auth.repositories.PermissionRepository;
import staport.rh.auth.repositories.RoleRepository;
import staport.rh.auth.services.interfaces.IRoleService;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class RoleService implements IRoleService {

    private static final Logger log = LoggerFactory.getLogger(RoleService.class);

    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final RoleMapper mapper;

    public RoleService(RoleRepository roleRepository, PermissionRepository permissionRepository, RoleMapper mapper) {
        this.roleRepository = roleRepository;
        this.permissionRepository = permissionRepository;
        this.mapper = mapper;
    }

    @Override
    @Transactional(readOnly = true)
    public List<RoleResponseDto> findAll() {
        return roleRepository.findAllByOrderByNomAsc().stream().map(mapper::toDto).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public RoleResponseDto findById(Long id) {
        return mapper.toDto(getEntityById(id));
    }

    @Override
    @Transactional
    public RoleResponseDto create(RoleCreateRequestDto dto) {
        if (roleRepository.existsByNom(dto.nom())) {
            throw new RoleAlreadyExistsException(dto.nom());
        }

        Role role = new Role();
        role.setNom(dto.nom());
        role.setDescription(dto.description());
        role.setPermissions(resolvePermissions(dto.permissionIds()));

        Role saved = roleRepository.save(role);
        log.info("Rôle créé : id={}, nom={}", saved.getId(), saved.getNom());
        return mapper.toDto(saved);
    }

    @Override
    @Transactional
    public RoleResponseDto update(Long id, RoleUpdateRequestDto dto) {
        Role role = getEntityById(id);

        roleRepository.findAllByOrderByNomAsc().stream()
                .filter(existing -> existing.getNom().equalsIgnoreCase(dto.nom()) && !existing.getId().equals(id))
                .findAny()
                .ifPresent(existing -> {
                    throw new RoleAlreadyExistsException(dto.nom());
                });

        role.setNom(dto.nom());
        role.setDescription(dto.description());
        role.setPermissions(resolvePermissions(dto.permissionIds()));

        Role updated = roleRepository.save(role);
        log.info("Rôle mis à jour : id={}, nom={}", updated.getId(), updated.getNom());
        return mapper.toDto(updated);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        Role role = getEntityById(id);
        roleRepository.delete(role);
        log.info("Rôle supprimé : id={}", id);
    }

    @Override
    @Transactional(readOnly = true)
    public List<PermissionResponseDto> findAllPermissions() {
        return permissionRepository.findAllByOrderByCodeAsc().stream().map(mapper::toPermissionDto).toList();
    }

    private Set<Permission> resolvePermissions(Set<Long> permissionIds) {
        if (permissionIds.isEmpty()) {
            return new HashSet<>();
        }
        List<Permission> found = permissionRepository.findAllById(permissionIds);
        if (found.size() != permissionIds.size()) {
            Set<Long> foundIds = found.stream().map(Permission::getId).collect(Collectors.toSet());
            Set<String> manquants = permissionIds.stream()
                    .filter(id -> !foundIds.contains(id))
                    .map(String::valueOf)
                    .collect(Collectors.toSet());
            throw new UnknownPermissionException(manquants);
        }
        return new HashSet<>(found);
    }

    private Role getEntityById(Long id) {
        return roleRepository.findById(id).orElseThrow(() -> new RoleNotFoundException(id));
    }
}
