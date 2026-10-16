package staport.rh.auth.services;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import staport.rh.auth.dtos.request.RoleSearchCriteria;
import staport.rh.auth.specifications.RoleSpecification;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.common.VersionOptimiste;
import staport.rh.auth.dtos.request.RoleCreateRequestDto;
import staport.rh.auth.dtos.request.RoleUpdateRequestDto;
import staport.rh.auth.dtos.response.PermissionResponseDto;
import staport.rh.auth.dtos.response.RoleResponseDto;
import staport.rh.auth.entities.Permission;
import staport.rh.auth.entities.Role;
import staport.rh.auth.entities.RolesSysteme;
import staport.rh.auth.exceptions.ProtectedRoleException;
import staport.rh.auth.exceptions.RoleAlreadyExistsException;
import staport.rh.auth.exceptions.RoleInUseException;
import staport.rh.auth.exceptions.RoleNotFoundException;
import staport.rh.auth.exceptions.UnknownPermissionException;
import staport.rh.auth.mappers.RoleMapper;
import staport.rh.auth.repositories.PermissionRepository;
import staport.rh.auth.repositories.RoleRepository;
import staport.rh.auth.repositories.UtilisateurRepository;
import staport.rh.auth.services.interfaces.IRoleService;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class RoleService implements IRoleService {

    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final UtilisateurRepository utilisateurRepository;
    private final RoleMapper mapper;

    public RoleService(RoleRepository roleRepository, PermissionRepository permissionRepository,
                       UtilisateurRepository utilisateurRepository, RoleMapper mapper) {
        this.roleRepository = roleRepository;
        this.permissionRepository = permissionRepository;
        this.utilisateurRepository = utilisateurRepository;
        this.mapper = mapper;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<RoleResponseDto> search(RoleSearchCriteria criteria, Pageable pageable) {
        return roleRepository.findAll(RoleSpecification.searchByCriteria(criteria), pageable).map(mapper::toDto);
    }

    @Override
    @Transactional(readOnly = true)
    public RoleResponseDto findById(Long id) {
        return mapper.toDto(getEntityById(id));
    }

    @Override
    @Transactional
    @AuditableAction(action = "ROLE_CREATION", type = TypeOperation.CREATE, entite = Role.class)
    public RoleResponseDto create(RoleCreateRequestDto dto) {
        String nom = dto.nom().strip();
        if (roleRepository.existsByNomIgnoreCase(nom)) {
            throw new RoleAlreadyExistsException(nom);
        }

        Role role = new Role();
        role.setNom(nom);
        role.setDescription(dto.description());
        role.setPermissions(resolvePermissions(dto.permissionIds()));

        Role saved = roleRepository.save(role);
        return mapper.toDto(saved);
    }

    @Override
    @Transactional
    @AuditableAction(action = "ROLE_MODIFICATION", type = TypeOperation.UPDATE, entite = Role.class)
    public RoleResponseDto update(Long id, RoleUpdateRequestDto dto) {
        Role role = getEntityById(id);
        VersionOptimiste.verifier(dto.version(), role.getVersion());
        String nom = dto.nom().strip();
        Set<Permission> permissions = resolvePermissions(dto.permissionIds());
        if (RolesSysteme.SYSTEM_ADMIN.equals(role.getNom())) {
            garantirAdministrationIntacte(role, nom, permissions);
        }

        roleRepository.findAllByOrderByNomAsc().stream()
                .filter(existing -> existing.getNom().strip().equalsIgnoreCase(nom) && !existing.getId().equals(id))
                .findAny()
                .ifPresent(existing -> {
                    throw new RoleAlreadyExistsException(nom);
                });

        role.setNom(nom);
        role.setDescription(dto.description());
        role.setPermissions(permissions);

        Role updated = roleRepository.saveAndFlush(role);
        return mapper.toDto(updated);
    }

    @Override
    @Transactional
    @AuditableAction(action = "ROLE_SUPPRESSION", type = TypeOperation.DELETE, entite = Role.class)
    public void delete(Long id) {
        Role role = getEntityById(id);
        if (RolesSysteme.SYSTEM_ADMIN.equals(role.getNom())) {
            throw new ProtectedRoleException(role.getNom(), "supprimé");
        }
        long comptes = utilisateurRepository.countByRoles_Id(id);
        if (comptes > 0) {
            throw new RoleInUseException(role.getNom(), comptes);
        }
        roleRepository.delete(role);
    }

    @Override
    @Transactional(readOnly = true)
    public List<PermissionResponseDto> findAllPermissions() {
        return permissionRepository.findAllByOrderByCodeAsc().stream().map(mapper::toPermissionDto).toList();
    }

    /** Le rôle d'administration garde son nom et toutes ses permissions : seule sa description se modifie. */
    private void garantirAdministrationIntacte(Role role, String nouveauNom, Set<Permission> nouvellesPermissions) {
        if (!role.getNom().equals(nouveauNom)) {
            throw new ProtectedRoleException(role.getNom(), "renommé");
        }
        if (!nouvellesPermissions.containsAll(role.getPermissions())) {
            throw new ProtectedRoleException(role.getNom(), "privé de permissions");
        }
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
