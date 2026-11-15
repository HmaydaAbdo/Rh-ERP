def est_stc_ou_sortie(observation: str | None) -> bool:
    """Règle STC : exactement « STC » ou « sortie », sans casse ni espaces superflus."""
    return observation is not None and observation.strip().lower() in {"stc", "sortie"}
