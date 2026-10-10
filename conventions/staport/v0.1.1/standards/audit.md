# Audit métier et sécurité

## Trois couches

Reprendre le pattern ERP-RH :

1. **Envers** conserve les instantanés avant/après des entités JPA auditées.
2. Un **journal unique** enregistre l'intention métier, le résultat, l'auteur, la cible, le périmètre,
   l'horodatage UTC, l'adresse/identifiant de requête selon politique locale et le lien vers la
   révision.
3. Des **garde-fous** vérifient la couverture des entités/opérations et empêchent l'application de
   réécrire l'historique.

## Règles

- Toute entité est auditée ou explicitement exclue avec justification testée. Secrets, mots de passe,
  jetons et valeurs confidentielles ne figurent jamais dans les instantanés.
- Toute écriture et sortie de données sensible passe par l'annotation/service d'audit commun ; les
  services publient les événements de sécurité et un listener unique les consigne.
- Pour une écriture réussie, données, révisions et journal sont atomiques. Un échec d'écriture ne
  modifie pas les données et la tentative est consignée en transaction séparée. Les politiques de
  consultation/export et de conservation sont définies par le projet et la loi applicable.
- Pas de mise à jour/suppression SQL en masse sur une entité auditée ; pas de cascade SQL qui
  contourne Envers. Une migration qui touche des données auditées écrit les traces correspondantes.
- Deux comptes PostgreSQL : propriétaire Flyway et compte d'exécution. L'application n'a que
  `SELECT, INSERT` sur l'audit ; le journal est append-only par permissions DB et API.
- Les traitements sans requête ouvrent un contexte système identifié. Les logs diagnostiques ne
  remplacent pas l'audit. Minimiser les données personnelles et ne jamais consigner secrets ou
  payloads complets.

## Tests minimaux

Vérifier instantanés create/update/delete, journal succès/échec, atomicité, opération imbriquée,
traitement système, refus 403, absence de données sensibles, migrations auditables et impossibilité
de modifier/supprimer le journal avec le compte d'exécution.
