package dev.trabecula.portal.cases;

import dev.trabecula.portal.cases.domain.SurgicalCase;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CaseRepository extends JpaRepository<SurgicalCase, UUID> {

    /** Cases with the nearest surgery date first: that is the order they need attention in. */
    List<SurgicalCase> findAllByOrderBySurgeryDateAscReferenceAsc();
}
