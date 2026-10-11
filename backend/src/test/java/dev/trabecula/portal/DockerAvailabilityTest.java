package dev.trabecula.portal;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.testcontainers.DockerClientFactory;

/**
 * {@link PortalIntegrationTest} is skipped when Docker cannot be reached, which is convenient
 * on a laptop and dangerous in CI: the build would be green without ever touching PostgreSQL.
 * This test turns that silent skip into a failure wherever the CI variable is set.
 */
class DockerAvailabilityTest {

    @Test
    @EnabledIfEnvironmentVariable(named = "CI", matches = "true")
    void dockerIsReachableInCi() {
        assertThat(DockerClientFactory.instance().isDockerAvailable())
                .as("Docker must be available in CI, otherwise the integration test is skipped")
                .isTrue();
    }
}
