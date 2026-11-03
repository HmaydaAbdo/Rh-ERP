"""Façade publique du domaine `common` : seul module que les autres domaines importent (ADR 0016 § 1)."""

from staport.domains.common.optimiste import incrementer_version, verifier_version
from staport.domains.common.recherche import ECHAPPEMENT, motif_contient

__all__ = ["ECHAPPEMENT", "incrementer_version", "motif_contient", "verifier_version"]
