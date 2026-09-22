package staport.rh.auth.services;

import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.auth.dtos.request.AdminResetPasswordRequestDto;
import staport.rh.auth.dtos.request.DenyPermissionsRequestDto;
import staport.rh.auth.dtos.request.UserCreateRequestDto;
import staport.rh.auth.dtos.request.UserUpdateRequestDto;
import staport.rh.auth.dtos.response.UserResponseDto;
import staport.rh.auth.entities.Permission;
import staport.rh.auth.entities.Role;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.exceptions.EmailAlreadyExistsException;
import staport.rh.auth.exceptions.InvalidReferenceException;
import staport.rh.auth.exceptions.RoleNotFoundException;
import staport.rh.auth.exceptions.UnknownPermissionException;
import staport.rh.auth.exceptions.UsernameAlreadyExistsException;
import staport.rh.auth.exceptions.UtilisateurNotFoundException;
import staport.rh.auth.mappers.UserMapper;
import staport.rh.auth.repositories.PermissionRepository;
import staport.rh.auth.repositories.RoleRepository;
import staport.rh.auth.repositories.UtilisateurRepository;
import staport.rh.auth.security.EffectivePermissionResolver;
import staport.rh.auth.services.interfaces.IUserService;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.services.interfaces.IEmployeeService;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class UserService implements IUserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);
    private static final String ROLE_SYSTEM_ADMIN = "SYSTEM_ADMIN";

    private final UtilisateurRepository repository;
    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final IEmployeeService employeeService;
    private final UserMapper mapper;
    private final EffectivePermissionResolver permissionResolver;
    private final PasswordEncoder passwordEncoder;
    private final EntityManager entityManager;

    public UserService(UtilisateurRepository repository, RoleRepository roleRepository,
                        PermissionRepository permissionRepository, IEmployeeService employeeService,
                        UserMapper mapper, EffectivePermissionResolver permissionResolver,
                        PasswordEncoder passwordEncoder, EntityManager entityManager) {
        this.repository = repository;
        this.roleRepository = roleRepository;
        this.permissionRepository = permissionRepository;
        this.employeeService = employeeService;
        this.mapper = mapper;
        this.permissionResolver = permissionResolver;
        this.passwordEncoder = passwordEncoder;
        this.entityManager = entityManager;
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserResponseDto> findAll() {
        return repository.findAll().stream().map(this::toDto).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public UserResponseDto findById(Long id) {
        return toDto(getEntityById(id));
    }

    @Override
    @Transactional
    public UserResponseDto create(UserCreateRequestDto dto) {
        if (repository.existsByUsername(dto.username())) {
            throw new UsernameAlreadyExistsException(dto.username());
        }
        if (repository.existsByEmail(dto.email())) {
            throw new EmailAlreadyExistsException(dto.email());
        }

        Utilisateur utilisateur = new Utilisateur();
        utilisateur.setUsername(dto.username());
        utilisateur.setEmail(dto.email());
        utilisateur.setMotDePasseHash(passwordEncoder.encode(dto.motDePasse()));
        utilisateur.setActif(true);
        utilisateur.setEmployee(resolveEmployeeReference(dto.employeeId()));
        utilisateur.setRoles(resolveRoles(dto.roleIds()));

        Utilisateur saved = repository.save(utilisateur);
        log.info("Utilisateur créé : id={}, username={}", saved.getId(), saved.getUsername());
        return toDto(saved);
    }

    @Override
    @Transactional
    public UserResponseDto update(Long id, UserUpdateRequestDto dto) {
        Utilisateur utilisateur = getEntityById(id);

        repository.findByEmail(dto.email())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new EmailAlreadyExistsException(dto.email());
                });

        utilisateur.setEmail(dto.email());
        utilisateur.setActif(dto.actif());
        utilisateur.setEmployee(resolveEmployeeReference(dto.employeeId()));
        utilisateur.setRoles(resolveRoles(dto.roleIds()));

        Utilisateur updated = repository.save(utilisateur);
        log.info("Utilisateur mis à jour : id={}, username={}", updated.getId(), updated.getUsername());
        return toDto(updated);
    }

    @Override
    @Transactional
    public UserResponseDto updateDeniedPermissions(Long id, DenyPermissionsRequestDto dto) {
        Utilisateur utilisateur = getEntityById(id);
        utilisateur.setPermissionsRefusees(resolvePermissions(dto.permissionIds()));
        Utilisateur updated = repository.save(utilisateur);
        log.info("Deny overrides mis à jour : utilisateurId={}, permissions={}", id, dto.permissionIds().size());
        return toDto(updated);
    }

    @Override
    @Transactional
    public void adminResetPassword(Long id, AdminResetPasswordRequestDto dto) {
        Utilisateur utilisateur = getEntityById(id);
        utilisateur.setMotDePasseHash(passwordEncoder.encode(dto.nouveauMotDePasse()));
        repository.save(utilisateur);
        log.info("Mot de passe réinitialisé par un administrateur : utilisateurId={}", id);
    }

    @Override
    @Transactional
    public void bootstrapAdminIfMissing(String username, String email, String motDePasse) {
        if (repository.existsByRoles_Nom(ROLE_SYSTEM_ADMIN)) {
            return;
        }

        Role adminRole = roleRepository.findAllByOrderByNomAsc().stream()
                .filter(r -> r.getNom().equals(ROLE_SYSTEM_ADMIN))
                .findFirst()
                .orElseThrow(() -> new RoleNotFoundException(-1L));

        Utilisateur admin = new Utilisateur();
        admin.setUsername(username);
        admin.setEmail(email);
        admin.setMotDePasseHash(passwordEncoder.encode(motDePasse));
        admin.setActif(true);
        admin.setRoles(Set.of(adminRole));

        repository.save(admin);
        log.info("Compte SYSTEM_ADMIN de bootstrap créé : username={}", username);
    }

    private Employee resolveEmployeeReference(Long employeeId) {
        if (employeeId == null) {
            return null;
        }
        if (!employeeService.existsById(employeeId)) {
            throw new InvalidReferenceException("Employé introuvable avec l'id : " + employeeId);
        }
        return entityManager.getReference(Employee.class, employeeId);
    }

    private Set<Role> resolveRoles(Set<Long> roleIds) {
        if (roleIds.isEmpty()) {
            return new HashSet<>();
        }
        List<Role> found = roleRepository.findAllById(roleIds);
        if (found.size() != roleIds.size()) {
            throw new RoleNotFoundException(roleIds.iterator().next());
        }
        return new HashSet<>(found);
    }

    private Set<Permission> resolvePermissions(Set<Long> permissionIds) {
        if (permissionIds.isEmpty()) {
            return new HashSet<>();
        }
        List<Permission> found = permissionRepository.findAllById(permissionIds);
        if (found.size() != permissionIds.size()) {
            Set<Long> foundIds = found.stream().map(Permission::getId).collect(Collectors.toSet());
            Set<String> manquants = permissionIds.stream()
                    .filter(pid -> !foundIds.contains(pid))
                    .map(String::valueOf)
                    .collect(Collectors.toSet());
            throw new UnknownPermissionException(manquants);
        }
        return new HashSet<>(found);
    }

    private UserResponseDto toDto(Utilisateur utilisateur) {
        return mapper.toDto(utilisateur, permissionResolver.resolve(utilisateur));
    }

    private Utilisateur getEntityById(Long id) {
        return repository.findById(id).orElseThrow(() -> new UtilisateurNotFoundException(id));
    }
}
