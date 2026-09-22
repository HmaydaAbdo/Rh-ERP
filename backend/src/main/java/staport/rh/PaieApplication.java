package staport.rh;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Racine unique de l'application, au niveau du package staport.rh, afin que le scan par défaut
 * (composants, entités, repositories) couvre tous les domaines métier (conventions/architecture.md) :
 * paie (historique), function, chantier, employee, et les futurs domaines pointage/paie v2.
 * Ne pas redescendre cette classe dans un sous-package de domaine (ex. staport.rh.paie), sous peine
 * de priver les autres domaines du scan Spring Boot par défaut.
 */
@SpringBootApplication
public class PaieApplication {

	public static void main(String[] args) {
		SpringApplication.run(PaieApplication.class, args);
	}

}
