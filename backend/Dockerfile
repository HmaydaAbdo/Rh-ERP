# Multi-stage : build Maven puis exécution sur un JRE léger. Image de production — buildée par la
# CI et poussée sur Docker Hub (voir .github/workflows/ci.yml) ; docker-compose.yml ne fait que la
# consommer via `image:`, jamais `build:`. Pour un développement backend actif avec redémarrage
# instantané, `./mvnw spring-boot:run` en local (pointant sur le Postgres exposé par
# docker-compose) reste plus rapide — voir le README à la racine du projet.

# Images de base épinglées par empreinte (reproductibilité, conventions/deployment.md) : la balise dit la version suivie,
# l'empreinte ce qui est réellement tiré. Dependabot propose la mise à jour des deux ensemble.
FROM eclipse-temurin:21-jdk@sha256:3e3c176ffed168beb42c607be9bc1639b466cf00261a0fb04425562c9d0c5c2b AS build
WORKDIR /app

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -q dependency:go-offline

COPY src/ src/
RUN ./mvnw -q package -DskipTests

FROM eclipse-temurin:21-jre@sha256:cff19e6215689161eb6162c11b86b0c60ddf802164f2eaf48d570f8fb79a36c5
WORKDIR /app

# Le processus ne tourne jamais en root : compte système dédié, sans shell ni répertoire personnel.
RUN groupadd --system --gid 10001 appuser \
    && useradd --system --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin appuser

COPY --from=build --chown=appuser:appuser /app/target/*.jar app.jar
USER appuser

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
    CMD wget -qO- http://localhost:8080/actuator/health | grep -q '"status":"UP"' || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
