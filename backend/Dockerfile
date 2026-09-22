# Multi-stage : build Maven puis exécution sur un JRE léger.
# Image "prête à l'emploi" pour docker-compose (démarrage en une commande, sans installation
# locale de Java/Maven). Pour un développement backend actif avec redémarrage instantané,
# `./mvnw spring-boot:run` en local (pointant sur le Postgres exposé par docker-compose sur
# localhost:5432) reste plus rapide — voir le README à la racine du projet.

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
ENTRYPOINT ["java", "-jar", "app.jar"]
