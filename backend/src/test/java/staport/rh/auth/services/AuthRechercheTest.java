package staport.rh.auth.services;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.auth.dtos.request.RoleCreateRequestDto;
import staport.rh.auth.dtos.request.RoleSearchCriteria;
import staport.rh.auth.dtos.request.UserCreateRequestDto;
import staport.rh.auth.dtos.request.UserSearchCriteria;
import staport.rh.auth.dtos.response.RoleResponseDto;
import staport.rh.auth.dtos.response.UserResponseDto;
import staport.rh.auth.services.interfaces.IRoleService;
import staport.rh.auth.services.interfaces.IUserService;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** Les listes de comptes et de rôles sont paginées et filtrées côté serveur (aucune liste entière n'est jamais renvoyée). */
class AuthRechercheTest extends AuditIntegrationTestBase {

    private static final String MOT_DE_PASSE = "un-mot-de-passe-2026";

    @Autowired
    private IUserService userService;
    @Autowired
    private IRoleService roleService;

    private UserResponseDto creerCompte(String prefixe, int n, boolean actif) {
        String nom = prefixe + n;
        UserResponseDto cree = userService.create(new UserCreateRequestDto(nom, nom + "@exemple.test", MOT_DE_PASSE, null, Set.of()));
        if (!actif) {
            userService.update(cree.id(), new staport.rh.auth.dtos.request.UserUpdateRequestDto(cree.email(), false, null, Set.of()));
        }
        return cree;
    }

    @Test
    void les_comptes_sont_pagines_filtres_et_tries_par_le_serveur() {
        String prefixe = "rech" + Long.toHexString(System.nanoTime() % 0xFFFFFF) + "-";
        creerCompte(prefixe, 1, true);
        creerCompte(prefixe, 2, true);
        creerCompte(prefixe, 3, false);

        Page<UserResponseDto> premiere = userService.search(new UserSearchCriteria(prefixe, null, null),
                PageRequest.of(0, 2, Sort.by("username")));
        Page<UserResponseDto> seconde = userService.search(new UserSearchCriteria(prefixe, null, null),
                PageRequest.of(1, 2, Sort.by("username")));
        Page<UserResponseDto> inactifs = userService.search(new UserSearchCriteria(prefixe, null, false), PageRequest.of(0, 10));

        assertThat(premiere.getTotalElements()).isEqualTo(3);
        assertThat(premiere.getContent()).extracting(UserResponseDto::username).containsExactly(prefixe + "1", prefixe + "2");
        assertThat(seconde.getContent()).extracting(UserResponseDto::username).containsExactly(prefixe + "3");
        assertThat(inactifs.getContent()).extracting(UserResponseDto::username).containsExactly(prefixe + "3");
    }

    @Test
    void un_joker_saisi_est_du_texte_pas_un_motif() {
        Page<UserResponseDto> resultat = userService.search(new UserSearchCriteria("%", null, null), PageRequest.of(0, 10));

        assertThat(resultat.getContent()).as("aucun identifiant ne contient « %% »").isEmpty();
    }

    @Test
    void les_roles_sont_pagines_filtres_et_tries_par_le_serveur() {
        String prefixe = "Rech" + Long.toHexString(System.nanoTime() % 0xFFFFFF) + "-";
        roleService.create(new RoleCreateRequestDto(prefixe + "A", "premier", Set.of()));
        roleService.create(new RoleCreateRequestDto(prefixe + "B", "second", Set.of()));

        Page<RoleResponseDto> page = roleService.search(new RoleSearchCriteria(prefixe.toLowerCase(), null),
                PageRequest.of(0, 1, Sort.by(Sort.Direction.DESC, "nom")));
        Page<RoleResponseDto> parDescription = roleService.search(new RoleSearchCriteria(prefixe, "second"), PageRequest.of(0, 10));

        assertThat(page.getTotalElements()).as("filtre insensible à la casse").isEqualTo(2);
        assertThat(page.getContent()).extracting(RoleResponseDto::nom).containsExactly(prefixe + "B");
        assertThat(parDescription.getContent()).extracting(RoleResponseDto::nom).containsExactly(prefixe + "B");
    }
}
