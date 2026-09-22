# Audit

> Conventions d'audit applicables à tous les modules.

## Audit des entités

* Toute entité sensible est annotée avec `@Audited`.
* Les champs sensibles sont exclus avec `@NotAudited`.
* Ne jamais auditer un mot de passe, un secret ou une donnée confidentielle.

---

# Audit des opérations

* Toute opération métier sensible est annotée avec `@AuditableAction`.
* L'annotation est placée sur les méthodes de Service.
* Ne jamais déduire une opération auditée à partir du nom de la méthode.

---

# Types d'opérations

* `CREATE`
* `UPDATE`
* `DELETE`

Convention :

* Une méthode "upsert" est considérée comme une opération `UPDATE`.

---

# Révision

Chaque révision Envers enregistre :

* l'utilisateur ;
* la date de la révision.

L'utilisateur est résolu dans l'ordre suivant :

1. `BatchAuditContext`
2. `SecurityContextHolder`
3. `"System"`

---

# Aspect

* Un seul aspect d'audit est utilisé : `GenericAuditAspect`.
* Le point d'entrée est `@AuditableAction`.
* Ne jamais créer un aspect dédié à une entité ou à un module.

---

# Journal d'audit

* Toutes les opérations sont centralisées dans la table `Log`.
* `LogEntryDetail` n'est jamais alimentée directement par les aspects.
* Chaque entrée de `Log` référence le numéro de révision Envers.

---

# Transaction

* L'écriture du journal d'audit est effectuée après le commit de la transaction métier.
* Ne jamais enregistrer un audit avant la validation de la transaction.

---

# Détail des modifications

* Les différences avant/après sont calculées à la demande.
* Utiliser `AuditReader` via `EnversDiffService`.
* Le détail ne transite jamais par la réponse de liste (`LogResponse`) : il est exposé uniquement
  par `GET /logs/{id}/details`, et chargé par le frontend à l'ouverture du détail.
* Les relations simples (`@ManyToOne`, `@OneToOne`) sont comparées sur l'identifiant de la cible,
  jamais sur leur `toString()`. Les collections restent exclues de la comparaison.
* Le rendu d'une relation passe par `AuditLabelResolver` : `"<id> — <libellé>"`.
  L'identifiant est toujours conservé en tête — c'est la seule valeur exacte et toujours
  disponible ; le libellé peut avoir changé ou concerner une cible supprimée depuis.
* Ordre de résolution du libellé : `nom`, `libelle`, `designation`, `intitule`, `reference`,
  `numero`, `code`, `username` ; à défaut, tout accesseur `getNumeroXxx` renvoyant une chaîne.
  Sans correspondance, seul l'identifiant est rendu.
* La résolution passe par les getters, jamais par les champs : sur un proxy Hibernate les champs
  déclarés sont ceux de la sous-classe générée et sont vides.
* Une erreur de lecture d'un champ ne doit jamais faire échouer la consultation du journal.
* Ne jamais comparer les champs manuellement dans un aspect.

---

# Identifiant de l'entité

* L'identifiant audité doit être connu au moment de l'audit.
* Si l'identifiant ne peut pas être déduit des paramètres, la méthode doit retourner l'identifiant de l'entité au lieu de `void`.

---

# Principes

* Un seul mécanisme d'audit pour toute l'application.
* Toute nouvelle fonctionnalité sensible doit être auditée.
* Les conventions Envers sont la source de vérité de l'historique.
* Ne jamais dupliquer la logique d'audit dans les services ou les aspects.
