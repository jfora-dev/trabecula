package dev.trabecula.portal.cases.api;

import dev.trabecula.portal.cases.CaseService;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/cases")
public class CaseController {

    static final MediaType STL = MediaType.parseMediaType("model/stl");

    /** Patient data: browsers may keep it for a while, shared caches and proxies may not. */
    private static final CacheControl PRIVATE_CACHE = CacheControl.maxAge(Duration.ofHours(1)).cachePrivate();

    private final CaseService service;

    public CaseController(CaseService service) {
        this.service = service;
    }

    @GetMapping
    public List<CaseSummaryDto> list() {
        return service.list();
    }

    @GetMapping("/{caseId}")
    public CaseDetailDto get(@PathVariable UUID caseId) {
        return service.get(caseId);
    }

    @PostMapping("/{caseId}/transitions")
    public CaseDetailDto transition(@PathVariable UUID caseId, @Valid @RequestBody TransitionRequest request) {
        return service.transition(caseId, request);
    }

    @GetMapping("/{caseId}/models/{modelId}/file")
    public ResponseEntity<Resource> modelFile(@PathVariable UUID caseId, @PathVariable UUID modelId) {
        return ResponseEntity.ok()
                .contentType(STL)
                .cacheControl(PRIVATE_CACHE)
                .body(service.modelFile(caseId, modelId));
    }

    /**
     * The voxels of the scan. They are stored gzipped and sent as they are, with
     * {@code Content-Encoding: gzip}, so the browser inflates them and hands the page plain
     * int16 data. Every browser accepts gzip; a client that does not would have to inflate it itself.
     */
    @GetMapping("/{caseId}/volume/data")
    public ResponseEntity<Resource> volumeData(@PathVariable UUID caseId) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_ENCODING, "gzip")
                .cacheControl(PRIVATE_CACHE)
                .body(service.volumeData(caseId));
    }
}
