"""Exposition Prometheus (`GET /metrics`), parité avec `/actuator/prometheus` de l'ancien backend (KAN-163).

Les mesures vivent dans des objets du domaine (`MetriquesAudit`, `MetriquesSynchronisation`) ; ce module ne fait que les
traduire au format texte de Prometheus, avec la bibliothèque officielle `prometheus-client`. Le point de collecte n'est
pas relayé par nginx : il n'est joignable que depuis le serveur (port de l'API lié à 127.0.0.1) et ne porte aucune
donnée personnelle, aucun identifiant ni contenu de requête (`conventions/metrics.md`).
"""

from collections.abc import Iterable

from prometheus_client import CollectorRegistry, generate_latest
from prometheus_client.core import CounterMetricFamily, GaugeMetricFamily, HistogramMetricFamily, Metric
from prometheus_client.registry import Collector

from staport.domains.audit.api import MetriquesAudit
from staport.domains.chantier.metriques import BORNES_DUREE_SECONDES, MetriquesSynchronisation

TYPE_CONTENU = "text/plain; version=1.0.0; charset=utf-8"


class Collecteur(Collector):
    def __init__(self, audit: MetriquesAudit, synchronisation: MetriquesSynchronisation) -> None:
        self._audit = audit
        self._synchronisation = synchronisation

    def collect(self) -> Iterable[Metric]:
        echecs = CounterMetricFamily(
            "rh_audit_ecriture_echec", "Entrées du journal d'audit qui n'ont pas pu s'écrire", labels=["categorie"]
        )
        for categorie, nombre in self._audit.ecritures_en_echec.items():
            echecs.add_metric([categorie], nombre)
        yield echecs
        evenements = CounterMetricFamily(
            "rh_audit_evenement_securite", "Événements de sécurité journalisés", labels=["action"]
        )
        for action, nombre in self._audit.evenements_securite.items():
            evenements.add_metric([action], nombre)
        yield evenements
        yield GaugeMetricFamily(
            "rh_audit_integrite_compromise",
            "1 quand le compte applicatif peut modifier une table d'audit",
            value=self._audit.integrite_compromise,
        )
        yield GaugeMetricFamily(
            "rh_audit_chaine_invalide",
            "1 quand la vérification du chaînage du journal d'audit échoue",
            value=self._audit.chaine_invalide,
        )

        sync = self._synchronisation
        yield CounterMetricFamily(
            "rh_chantier_sync_success", "Synchronisations de chantiers réussies", value=sync.succes
        )
        yield CounterMetricFamily(
            "rh_chantier_sync_failure", "Synchronisations de chantiers échouées", value=sync.echecs
        )
        yield CounterMetricFamily(
            "rh_chantier_sync_records_ignored",
            "Lignes de l'ERP ignorées (code manquant ou conflit d'intégrité)",
            value=sync.lignes_ignorees,
        )
        duree = HistogramMetricFamily("rh_chantier_sync_duration_seconds", "Durée d'une synchronisation de chantiers")
        cumul = 0
        buckets: list[tuple[str, float]] = []
        for borne, effectif in zip(BORNES_DUREE_SECONDES, sync.seaux, strict=True):
            cumul += effectif
            buckets.append((str(borne), cumul))
        buckets.append(("+Inf", sync.nombre_durees))
        duree.add_metric([], buckets, sync.somme_durees)
        yield duree


def creer_registre(audit: MetriquesAudit, synchronisation: MetriquesSynchronisation) -> CollectorRegistry:
    registre = CollectorRegistry()
    registre.register(Collecteur(audit, synchronisation))
    return registre


def exporter(registre: CollectorRegistry) -> bytes:
    return generate_latest(registre)
