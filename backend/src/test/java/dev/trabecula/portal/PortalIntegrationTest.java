package dev.trabecula.portal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.trabecula.portal.demo.DemoDataService;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.zip.GZIPInputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * The whole application against a real PostgreSQL: Flyway migration, Hibernate schema check,
 * demo seeding, the workflow with optimistic locking, and the binary downloads.
 *
 * <p>Needs Docker; without it the class is skipped rather than failed.
 */
@SpringBootTest(properties = {"spring.jpa.hibernate.ddl-auto=validate", "portal.demo.enabled=true"})
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class PortalIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    private static final UUID AWAITING = caseId("tr-2026-0142");
    private static final UUID APPROVED = caseId("tr-2026-0137");
    private static final UUID WITHOUT_PLAN = caseId("tr-2026-0149");

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private DemoDataService demoData;

    private static UUID caseId(String key) {
        return UUID.nameUUIDFromBytes(("case:" + key).getBytes(StandardCharsets.UTF_8));
    }

    @BeforeEach
    void startFromTheSeededCases() {
        demoData.reset();
    }

    private ResultActions transition(UUID caseId, String body) throws Exception {
        return mvc.perform(post("/api/cases/{id}/transitions", caseId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private JsonNode detail(UUID caseId) throws Exception {
        String body = mvc.perform(get("/api/cases/{id}", caseId))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return json.readTree(body);
    }

    @Test
    void listsTheSeededCasesByDateOfSurgery() throws Exception {
        mvc.perform(get("/api/cases"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[0].reference").value("TR-2026-0137"))
                .andExpect(jsonPath("$[0].status").value("APPROVED"))
                .andExpect(jsonPath("$[1].reference").value("TR-2026-0142"))
                .andExpect(jsonPath("$[1].status").value("AWAITING_APPROVAL"))
                .andExpect(jsonPath("$[2].reference").value("TR-2026-0149"))
                .andExpect(jsonPath("$[2].status").value("IN_DESIGN"));
    }

    @Test
    void aCaseComesWithItsModelsScanAndHistory() throws Exception {
        mvc.perform(get("/api/cases/{id}", AWAITING))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.allowedActions", hasSize(2)))
                .andExpect(jsonPath("$.models", hasSize(9)))
                .andExpect(jsonPath("$.models[0].name").value("Radius"))
                .andExpect(jsonPath("$.volume.dimensions[0]").value(112))
                .andExpect(jsonPath("$.volume.rescaleIntercept").value(-1024.0))
                .andExpect(jsonPath("$.history", hasSize(2)))
                .andExpect(jsonPath("$.history[0].action").value("CREATE"))
                .andExpect(jsonPath("$.history[1].actor").value("M. Frei"));
    }

    @Test
    void approvingIsRecordedBumpsTheVersionAndCannotBeRepeated() throws Exception {
        transition(AWAITING, "{\"action\":\"APPROVE\",\"expectedVersion\":0}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.allowedActions", hasSize(0)))
                .andExpect(jsonPath("$.history", hasSize(3)))
                .andExpect(jsonPath("$.history[2].action").value("APPROVE"))
                .andExpect(jsonPath("$.history[2].actor").value("Dr. L. Brunner"));

        // A second click from a page that still shows the old state.
        transition(AWAITING, "{\"action\":\"APPROVE\",\"expectedVersion\":0}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STALE_VERSION"));

        // Even with the current version, an approved case stays approved.
        transition(AWAITING, "{\"action\":\"REQUEST_CHANGES\",\"expectedVersion\":1,\"comment\":\"Too late\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));

        assertThat(detail(AWAITING).get("history")).hasSize(3);
    }

    @Test
    void requestingChangesNeedsAReasonAndReturnsTheCaseToTheDesigner() throws Exception {
        transition(AWAITING, "{\"action\":\"REQUEST_CHANGES\",\"expectedVersion\":0}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_TRANSITION_REQUEST"));
        assertThat(detail(AWAITING).get("status").asText()).isEqualTo("AWAITING_APPROVAL");

        transition(AWAITING, "{\"action\":\"REQUEST_CHANGES\",\"expectedVersion\":0,\"comment\":\"Longer plate, please.\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_DESIGN"))
                .andExpect(jsonPath("$.history[2].comment").value("Longer plate, please."));

        transition(AWAITING, "{\"action\":\"SUBMIT_FOR_APPROVAL\",\"expectedVersion\":1}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AWAITING_APPROVAL"))
                .andExpect(jsonPath("$.history[3].actor").value("M. Frei"));
    }

    @Test
    void aCaseWithoutAPlanCannotBeSubmitted() throws Exception {
        transition(WITHOUT_PLAN, "{\"action\":\"SUBMIT_FOR_APPROVAL\",\"expectedVersion\":0}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"));
    }

    @Test
    void anUnknownCaseIsNotFound() throws Exception {
        mvc.perform(get("/api/cases/{id}", UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void everyModelFileIsABinaryStlOfTheAdvertisedSize() throws Exception {
        for (JsonNode model : detail(APPROVED).get("models")) {
            byte[] stl = mvc.perform(get(model.get("fileUrl").asText()))
                    .andExpect(status().isOk())
                    .andExpect(content().contentType("model/stl"))
                    .andReturn()
                    .getResponse()
                    .getContentAsByteArray();

            assertThat(stl).hasSize(model.get("sizeBytes").asInt());
            // Binary STL: 80 byte header, triangle count, then 50 bytes per triangle.
            assertThat(stl.length).isEqualTo(84 + 50 * model.get("triangleCount").asInt());
        }
    }

    @Test
    void theScanInflatesToOneInt16PerVoxel() throws Exception {
        JsonNode volume = detail(AWAITING).get("volume");
        byte[] gzipped = mvc.perform(get(volume.get("dataUrl").asText()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Encoding", "gzip"))
                .andReturn()
                .getResponse()
                .getContentAsByteArray();

        long voxels = 1;
        for (JsonNode n : volume.get("dimensions")) {
            voxels *= n.asLong();
        }
        try (GZIPInputStream in = new GZIPInputStream(new ByteArrayInputStream(gzipped))) {
            assertThat(in.readAllBytes()).hasSize((int) (voxels * 2));
        }
    }

    @Test
    void resettingTheDemoRestoresTheOriginalState() throws Exception {
        transition(AWAITING, "{\"action\":\"APPROVE\",\"expectedVersion\":0}").andExpect(status().isOk());

        mvc.perform(post("/api/demo/reset")).andExpect(status().isNoContent());

        JsonNode restored = detail(AWAITING);
        assertThat(restored.get("status").asText()).isEqualTo("AWAITING_APPROVAL");
        assertThat(restored.get("version").asInt()).isZero();
        assertThat(restored.get("history")).hasSize(2);
    }
}
