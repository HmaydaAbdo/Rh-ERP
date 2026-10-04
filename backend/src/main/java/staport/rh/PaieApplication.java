package staport.rh;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.web.config.EnableSpringDataWebSupport;
import org.springframework.data.web.config.EnableSpringDataWebSupport.PageSerializationMode;

/**
 * Racine unique de l'application, au niveau du package staport.rh, afin que le scan par défaut
 * (composants, entités, repositories) couvre tous les domaines métier (conventions/architecture.md) :
 * paie (historique), function, chantier, employee, et les futurs domaines pointage/paie v2.
 * Ne pas redescendre cette classe dans un sous-package de domaine (ex. staport.rh.paie), sous peine
 * de priver les autres domaines du scan Spring Boot par défaut.
 *
 * <p>Une page de résultats est sérialisée par un DTO stable ({@code content} et {@code page} : taille, numéro, nombre total
 * d'éléments et de pages), jamais par la sérialisation brute de {@code PageImpl} dont Spring Data ne garantit pas la
 * structure (il avertit à chaque réponse). Le frontend lit cette structure ({@code shared/models/page.model.ts}). Posé ici
 * plutôt que dans une configuration : le réglage s'applique alors à toute l'application et aux tests de la couche web.
 */
@SpringBootApplication
@EnableSpringDataWebSupport(pageSerializationMode = PageSerializationMode.VIA_DTO)
public class PaieApplication {

	public static void main(String[] args) {
		SpringApplication.run(PaieApplication.class, args);
	}

}
