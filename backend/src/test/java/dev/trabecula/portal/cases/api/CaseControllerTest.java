package dev.trabecula.portal.cases.api;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.trabecula.portal.cases.CaseNotFoundException;
import dev.trabecula.portal.cases.CaseService;
import dev.trabecula.portal.cases.StaleCaseException;
import dev.trabecula.portal.cases.domain.CaseAction;
import dev.trabecula.portal.cases.domain.CaseStatus;
import dev.trabecula.portal.cases.domain.IllegalTransitionException;
import dev.trabecula.portal.cases.domain.InvalidTransitionRequestException;
import dev.trabecula.portal.cases.domain.ModelKind;
import dev.trabecula.portal.cases.domain.PlanStage;
import dev.trabecula.portal.cases.domain.Side;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** The HTTP contract of the case endpoints: JSON shape, status codes and problem documents. */
@WebMvcTest(CaseController.class)
class CaseControllerTest {

    private static final UUID CASE_ID = UUID.fromString("157e17e6-f47f-31ee-8a6c-2c2486637e68");
    private static final UUID MODEL_ID = UUID.fromString("0b0e7c1e-9f3a-3c55-8d4e-1a2b3c4d5e6f");
    private static final MediaType PROBLEM = MediaType.APPLICATION_PROBLEM_JSON;

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private CaseService service;

    private static CaseDetailDto detail() {
        return new CaseDetailDto(
                CASE_ID,
                "TR-2026-0142",
                "Distal radius malunion, dorsal tilt",
                "WRIST",
                Side.RIGHT,
                "P-48213",
                1968,
                "Dr. L. Brunner",
                "Demo Clinic North",
                "M. Frei",
                CaseStatus.AWAITING_APPROVAL,
                LocalDate.parse("2026-11-05"),
                "Volar opening-wedge osteotomy.",
                Instant.parse("2026-10-01T08:12:00Z"),
                Instant.parse("2026-10-06T15:40:00Z"),
                3L,
                List.of(CaseAction.APPROVE, CaseAction.REQUEST_CHANGES),
                List.of(new CaseModelDto(
                        MODEL_ID, "Volar plate", ModelKind.PLATE, PlanStage.PLANNED, "#3E7CCB", 24000, 1200084L,
                        "/api/cases/" + CASE_ID + "/models/" + MODEL_ID + "/file")),
                new CtVolumeDto(
                        UUID.randomUUID(), "CT wrist", new int[] {112, 96, 160}, new double[] {0.6, 0.6, 0.6},
                        new double[] {-33.3, -28.5, 0.0}, 1.0, -1024.0, 300,
                        "/api/cases/" + CASE_ID + "/volume/data"),
                List.of(new StatusEventDto(
                        UUID.randomUUID(), null, CaseStatus.IN_DESIGN, CaseAction.CREATE, "Dr. L. Brunner", null,
                        Instant.parse("2026-10-01T08:12:00Z"))));
    }

    @Test
    void returnsACaseWithIsoDatesAndPlainEnums() throws Exception {
        given(service.get(CASE_ID)).willReturn(detail());

        mvc.perform(get("/api/cases/{id}", CASE_ID))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(CASE_ID.toString()))
                .andExpect(jsonPath("$.status").value("AWAITING_APPROVAL"))
                .andExpect(jsonPath("$.side").value("RIGHT"))
                .andExpect(jsonPath("$.surgeryDate").value("2026-11-05"))
                .andExpect(jsonPath("$.updatedAt").value("2026-10-06T15:40:00Z"))
                .andExpect(jsonPath("$.version").value(3))
                .andExpect(jsonPath("$.allowedActions[0]").value("APPROVE"))
                .andExpect(jsonPath("$.allowedActions[1]").value("REQUEST_CHANGES"))
                .andExpect(jsonPath("$.models[0].kind").value("PLATE"))
                .andExpect(jsonPath("$.models[0].fileUrl").value("/api/cases/" + CASE_ID + "/models/" + MODEL_ID + "/file"))
                .andExpect(jsonPath("$.volume.dimensions[2]").value(160))
                .andExpect(jsonPath("$.volume.spacingMm[0]").value(0.6))
                .andExpect(jsonPath("$.volume.rescaleIntercept").value(-1024.0))
                .andExpect(jsonPath("$.history[0].fromStatus").doesNotExist())
                .andExpect(jsonPath("$.history[0].action").value("CREATE"));
    }

    @Test
    void anUnknownCaseIsAProblemWithStatus404() throws Exception {
        given(service.get(CASE_ID)).willThrow(new CaseNotFoundException("There is no case with the id " + CASE_ID + "."));

        mvc.perform(get("/api/cases/{id}", CASE_ID))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.detail").value(containsString(CASE_ID.toString())));
    }

    @Test
    void anIdThatIsNotAUuidIsRejected() throws Exception {
        mvc.perform(get("/api/cases/{id}", "not-a-uuid")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void appliesATransition() throws Exception {
        given(service.transition(CASE_ID, new TransitionRequest(CaseAction.APPROVE, 3L, null))).willReturn(detail());

        mvc.perform(post("/api/cases/{id}/transitions", CASE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"APPROVE\",\"expectedVersion\":3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reference").value("TR-2026-0142"));
    }

    @Test
    void aTransitionTheWorkflowForbidsIsAConflict() throws Exception {
        given(service.transition(any(), any()))
                .willThrow(new IllegalTransitionException("A case that is approved cannot take the action approve."));

        mvc.perform(post("/api/cases/{id}/transitions", CASE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"APPROVE\",\"expectedVersion\":4}"))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM))
                .andExpect(jsonPath("$.code").value("ILLEGAL_TRANSITION"))
                .andExpect(jsonPath("$.detail").value("A case that is approved cannot take the action approve."));
    }

    @Test
    void aTransitionBasedOnAnOldVersionIsAConflict() throws Exception {
        given(service.transition(any(), any())).willThrow(new StaleCaseException());

        mvc.perform(post("/api/cases/{id}/transitions", CASE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"APPROVE\",\"expectedVersion\":1}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STALE_VERSION"));
    }

    @Test
    void aChangeRequestWithoutAReasonIsABadRequest() throws Exception {
        given(service.transition(any(), any()))
                .willThrow(new InvalidTransitionRequestException("Say what the designer should change."));

        mvc.perform(post("/api/cases/{id}/transitions", CASE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"REQUEST_CHANGES\",\"expectedVersion\":3}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_TRANSITION_REQUEST"));
    }

    @Test
    void aTransitionWithoutActionOrVersionNeverReachesTheService() throws Exception {
        mvc.perform(post("/api/cases/{id}/transitions", CASE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedVersion\":3}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(PROBLEM));

        mvc.perform(post("/api/cases/{id}/transitions", CASE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"APPROVE\"}"))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/cases/{id}/transitions", CASE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"DELETE_EVERYTHING\",\"expectedVersion\":3}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    @Test
    void servesAModelAsStlThatOnlyTheBrowserMayCache() throws Exception {
        byte[] stl = {1, 2, 3, 4};
        given(service.modelFile(CASE_ID, MODEL_ID)).willReturn(new ByteArrayResource(stl));

        mvc.perform(get("/api/cases/{id}/models/{modelId}/file", CASE_ID, MODEL_ID))
                .andExpect(status().isOk())
                .andExpect(content().contentType("model/stl"))
                .andExpect(header().string("Cache-Control", allOf(containsString("private"), containsString("max-age=3600"))))
                .andExpect(content().bytes(stl));
    }

    @Test
    void servesTheScanGzippedAsStored() throws Exception {
        byte[] gzipped = {31, -117, 8, 0};
        given(service.volumeData(CASE_ID)).willReturn(new ByteArrayResource(gzipped));

        mvc.perform(get("/api/cases/{id}/volume/data", CASE_ID))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_OCTET_STREAM))
                .andExpect(header().string("Content-Encoding", "gzip"))
                .andExpect(content().bytes(gzipped));
    }
}
