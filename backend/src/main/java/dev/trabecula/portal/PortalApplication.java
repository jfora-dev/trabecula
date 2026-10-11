package dev.trabecula.portal;

import java.time.Clock;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class PortalApplication {

    public static void main(String[] args) {
        SpringApplication.run(PortalApplication.class, args);
    }

    /** One clock for the whole application, so tests can pin the time. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
