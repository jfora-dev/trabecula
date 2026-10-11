# syntax=docker/dockerfile:1
# ---- build ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

COPY pom.xml .
COPY src ./src
# The Maven repository is kept in a build cache, so only the first build downloads everything.
# Tests run in CI (they need Docker for PostgreSQL); the image build only packages.
RUN --mount=type=cache,target=/root/.m2 mvn -B -ntp package -Dmaven.test.skip=true

# ---- run ----
FROM eclipse-temurin:21-jre
RUN useradd --system --no-create-home portal
USER portal
WORKDIR /app
COPY --from=build /build/target/trabecula-portal.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
