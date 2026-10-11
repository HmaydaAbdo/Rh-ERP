# Multi-stage : build Maven puis exécution sur un JRE léger. Image de production — buildée par la
# CI et poussée sur Docker Hub (voir .github/workflows/ci.yml) ; docker-compose.yml ne fait que la
# consommer via `image:`, jamais `build:`. Pour un développement backend actif avec redémarrage
# instantané, `./mvnw spring-boot:run` en local (pointant sur le Postgres exposé par
# docker-compose) reste plus rapide — voir le README à la racine du projet.

# Images de base épinglées par empreinte (reproductibilité, conventions/deployment.md) : la balise dit la version suivie,
# l'empreinte ce qui est réellement tiré. Dependabot propose la mise à jour des deux ensemble.
FROM eclipse-temurin:25-jdk@sha256:8c0a84ea11c8f6ed52600fc19f1040121f2a162998e9f50a5faebbbad9172dcc AS build
WORKDIR /app

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -q dependency:go-offline

COPY src/ src/
RUN ./mvnw -q package -DskipTests

FROM eclipse-temurin:25-jre@sha256:fcd7fd7b387f94bb2ac461478a7436ad8e349924c374ea8313919624dceae636
WORKDIR /app

# Le processus ne tourne jamais en root : compte système dédié, sans shell ni répertoire personnel.
RUN groupadd --system --gid 10001 appuser \
    && useradd --system --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /app/logs \
    && chown appuser:appuser /app/logs

COPY --from=build --chown=appuser:appuser /app/target/*.jar app.jar
USER appuser

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
    CMD wget -qO- http://localhost:8080/actuator/health | grep -q '"status":"UP"' || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
