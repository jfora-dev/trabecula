package dev.trabecula.portal.demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.trabecula.portal.cases.CaseRepository;
import dev.trabecula.portal.cases.domain.CaseModel;
import dev.trabecula.portal.cases.domain.CtVolume;
import dev.trabecula.portal.cases.domain.SurgicalCase;
import dev.trabecula.portal.demo.DemoManifest.DemoCase;
import dev.trabecula.portal.demo.DemoManifest.DemoEvent;
import dev.trabecula.portal.demo.DemoManifest.DemoModel;
import dev.trabecula.portal.demo.DemoManifest.DemoVolume;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Loads the synthetic demo cases described by {@code demo-assets/manifest.json}.
 *
 * <p>Ids are derived from the manifest keys, so a case keeps its URL across restarts and resets.
 */
@Service
@ConditionalOnProperty(name = "portal.demo.enabled", havingValue = "true")
public class DemoDataService {

    private static final Logger log = LoggerFactory.getLogger(DemoDataService.class);
    private static final String MANIFEST = "demo-assets/manifest.json";

    private final CaseRepository cases;
    private final ObjectMapper json;

    public DemoDataService(CaseRepository cases, ObjectMapper json) {
        this.cases = cases;
        this.json = json;
    }

    /** Seeds an empty database; leaves an existing one alone. */
    @Transactional
    public void seedIfEmpty() {
        if (cases.count() == 0) {
            seed();
        }
    }

    /** Puts every demo case back to its original state. Children go with their case (ON DELETE CASCADE). */
    @Transactional
    public void reset() {
        cases.deleteAllInBatch();
        seed();
    }

    private void seed() {
        DemoManifest manifest = readManifest();
        for (DemoCase demoCase : manifest.cases()) {
            cases.save(toEntity(demoCase));
        }
        log.info("Seeded {} demo cases", manifest.cases().size());
    }

    private DemoManifest readManifest() {
        try (InputStream in = new ClassPathResource(MANIFEST).getInputStream()) {
            return json.readValue(in, DemoManifest.class);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + MANIFEST, e);
        }
    }

    private static SurgicalCase toEntity(DemoCase demo) {
        SurgicalCase surgicalCase = new SurgicalCase(
                stableId("case", demo.key()),
                demo.reference(),
                demo.title(),
                demo.anatomy(),
                demo.side(),
                demo.patientPseudonym(),
                demo.patientBirthYear(),
                demo.surgeonName(),
                demo.clinic(),
                demo.designerName(),
                demo.surgeryDate(),
                demo.createdAt());
        surgicalCase.describePlan(demo.planNotes());

        int order = 0;
        for (DemoModel model : demo.models()) {
            surgicalCase.addModel(new CaseModel(
                    stableId("model", demo.key() + ":" + order),
                    surgicalCase,
                    order,
                    model.name(),
                    model.kind(),
                    model.stage(),
                    model.color(),
                    model.file(),
                    model.triangleCount(),
                    model.sizeBytes()));
            order++;
        }

        DemoVolume volume = demo.volume();
        if (volume != null) {
            surgicalCase.attachVolume(new CtVolume(
                    stableId("volume", demo.key()),
                    surgicalCase,
                    volume.file(),
                    volume.description(),
                    volume.dimensions(),
                    volume.spacingMm(),
                    volume.originMm(),
                    volume.rescaleSlope(),
                    volume.rescaleIntercept(),
                    volume.suggestedBoneThresholdHu()));
        }

        for (DemoEvent event : demo.history()) {
            surgicalCase.recordEvent(event.action(), event.toStatus(), event.actor(), event.comment(), event.at());
        }
        if (surgicalCase.getStatus() != demo.status()) {
            throw new IllegalStateException("History of " + demo.reference() + " does not end in " + demo.status());
        }
        return surgicalCase;
    }

    private static UUID stableId(String type, String name) {
        return UUID.nameUUIDFromBytes((type + ":" + name).getBytes(StandardCharsets.UTF_8));
    }
}
