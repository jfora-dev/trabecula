package dev.trabecula.portal.demo;

import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Seeds the demo cases while the application starts.
 *
 * <p>This runs once every bean exists, so after Flyway has migrated the schema, and before the
 * web server opens its port. By the time the API answers, the cases are there.
 */
@Component
@ConditionalOnProperty(name = "portal.demo.enabled", havingValue = "true")
class DemoDataInitializer implements SmartInitializingSingleton {

    private final DemoDataService demoData;

    DemoDataInitializer(DemoDataService demoData) {
        this.demoData = demoData;
    }

    @Override
    public void afterSingletonsInstantiated() {
        demoData.seedIfEmpty();
    }
}
