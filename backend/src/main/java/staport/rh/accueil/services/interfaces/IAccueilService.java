package staport.rh.accueil.services.interfaces;

import staport.rh.accueil.dtos.request.AccueilUpdateRequestDto;
import staport.rh.accueil.dtos.response.AccueilResponseDto;

/** Façade du domaine Accueil : l'accueil de l'utilisateur connecté, et celui d'un utilisateur choisi par un administrateur. */
public interface IAccueilService {

    AccueilResponseDto lire(String username);

    AccueilResponseDto enregistrer(String username, AccueilUpdateRequestDto dto);

    /** Supprime le choix : l'utilisateur retrouve tous les indicateurs que ses permissions autorisent. */
    AccueilResponseDto reinitialiser(String username);

    AccueilResponseDto lireDe(Long utilisateurId);

    AccueilResponseDto enregistrerDe(Long utilisateurId, AccueilUpdateRequestDto dto);

    AccueilResponseDto reinitialiserDe(Long utilisateurId);
}
