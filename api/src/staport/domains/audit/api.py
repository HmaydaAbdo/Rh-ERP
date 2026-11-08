"""Façade publique du domaine `audit` : seul module que les autres domaines importent (ADR 0016 § 1)."""

from staport.domains.audit.consultation import instantanes_suppression
from staport.domains.audit.integrite import VerificationIntegrite
from staport.domains.audit.metriques import MetriquesAudit
from staport.domains.audit.registre import (
    ChampAudite,
    CollectionAuditee,
    EntiteAuditee,
    RelationAuditee,
    registre,
)
from staport.domains.audit.service import Audit

__all__ = [
    "Audit",
    "ChampAudite",
    "CollectionAuditee",
    "EntiteAuditee",
    "MetriquesAudit",
    "RelationAuditee",
    "VerificationIntegrite",
    "instantanes_suppression",
    "registre",
]
