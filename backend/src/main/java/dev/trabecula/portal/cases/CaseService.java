package dev.trabecula.portal.cases;

import dev.trabecula.portal.assets.AssetStorage;
import dev.trabecula.portal.cases.api.CaseDetailDto;
import dev.trabecula.portal.cases.api.CaseMapper;
import dev.trabecula.portal.cases.api.CaseSummaryDto;
import dev.trabecula.portal.cases.api.TransitionRequest;
import dev.trabecula.portal.cases.domain.CaseModel;
import dev.trabecula.portal.cases.domain.CtVolume;
import dev.trabecula.portal.cases.domain.SurgicalCase;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Use cases of the portal. Each public method is one transaction and returns DTOs, so no
 * entity leaves the persistence context half-loaded.
 */
@Service
public class CaseService {

    private final CaseRepository cases;
    private final AssetStorage assets;
    private final Clock clock;

    public CaseService(CaseRepository cases, AssetStorage assets, Clock clock) {
        this.cases = cases;
        this.assets = assets;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<CaseSummaryDto> list() {
        return cases.findAllByOrderBySurgeryDateAscReferenceAsc().stream()
                .map(CaseMapper::toSummary)
                .toList();
    }

    @Transactional(readOnly = true)
    public CaseDetailDto get(UUID caseId) {
        return CaseMapper.toDetail(find(caseId));
    }

    /**
     * Applies a workflow action.
     *
     * <p>The caller says which version of the case the decision was based on. If the case has
     * moved on since, the action is refused instead of being applied to a plan nobody looked at.
     */
    @Transactional
    public CaseDetailDto transition(UUID caseId, TransitionRequest request) {
        SurgicalCase surgicalCase = find(caseId);
        if (!request.expectedVersion().equals(surgicalCase.getVersion())) {
            throw new StaleCaseException();
        }
        surgicalCase.apply(request.action(), request.comment(), clock.instant());
        // The case is managed, so nothing needs saving. Flush now so the response carries
        // the new version number and a lost race surfaces here rather than at commit.
        cases.flush();
        return CaseMapper.toDetail(surgicalCase);
    }

    @Transactional(readOnly = true)
    public Resource modelFile(UUID caseId, UUID modelId) {
        CaseModel model = find(caseId).getModels().stream()
                .filter(candidate -> candidate.getId().equals(modelId))
                .findFirst()
                .orElseThrow(() -> new CaseNotFoundException("This case has no model with the id " + modelId + "."));
        return assets.load(model.getStorageKey());
    }

    @Transactional(readOnly = true)
    public Resource volumeData(UUID caseId) {
        CtVolume volume = find(caseId).getVolume();
        if (volume == null) {
            throw new CaseNotFoundException("This case has no CT scan.");
        }
        return assets.load(volume.getStorageKey());
    }

    private SurgicalCase find(UUID caseId) {
        return cases.findById(caseId)
                .orElseThrow(() -> new CaseNotFoundException("There is no case with the id " + caseId + "."));
    }
}
