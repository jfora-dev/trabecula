package dev.trabecula.portal.demo;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lets a visitor of the public demo undo whatever the previous visitor did.
 *
 * <p>Exists only while {@code portal.demo.enabled} is true; a real deployment would not have it.
 */
@RestController
@RequestMapping("/api/demo")
@ConditionalOnProperty(name = "portal.demo.enabled", havingValue = "true")
class DemoController {

    private final DemoDataService demoData;

    DemoController(DemoDataService demoData) {
        this.demoData = demoData;
    }

    /**
     * One reset at a time: two that overlap would both try to insert the same cases. Holding
     * the monitor around the call covers the whole transaction, which is enough for a demo
     * that runs as a single instance.
     */
    @PostMapping("/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public synchronized void reset() {
        demoData.reset();
    }
}
