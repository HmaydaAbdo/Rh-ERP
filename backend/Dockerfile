# Multi-stage : build Maven puis exécution sur un JRE léger. Image de production — buildée par la
# CI et poussée sur Docker Hub (voir .github/workflows/ci.yml) ; docker-compose.yml ne fait que la
# consommer via `image:`, jamais `build:`. Pour un développement backend actif avec redémarrage
# instantané, `./mvnw spring-boot:run` en local (pointant sur le Postgres exposé par
# docker-compose) reste plus rapide — voir le README à la racine du projet.

FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -q dependency:go-offline

COPY src/ src/
RUN ./mvnw -q package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
    CMD wget -qO- http://localhost:8080/actuator/health | grep -q '"status":"UP"' || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
