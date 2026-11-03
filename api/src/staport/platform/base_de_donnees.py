"""Moteur et session SQLAlchemy asynchrones (KAN-212, ADR 0016 § 2).

`expire_on_commit=False` (documenté par SQLAlchemy pour l'asynchrone : sans lui, lire un attribut après un commit
déclencherait une E/S implicite impossible en `await`). Une opération métier = une transaction, ouverte par le service
avec `session.begin()` ; la dépendance FastAPI fournit seulement la session et la ferme.
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base déclarative des modèles de persistance de tous les domaines."""


def creer_moteur(url: str) -> AsyncEngine:
    return create_async_engine(url, pool_pre_ping=True)


def creer_fabrique_sessions(moteur: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(moteur, expire_on_commit=False)


async def fournir_session(fabrique: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    """Corps de la dépendance FastAPI (liée à la fabrique de l'application par `Depends` dans `main.py`)."""
    async with fabrique() as session:
        yield session
