package dev.trabecula.portal.assets;

import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * Serves the demo assets packaged with the application.
 *
 * <p>Good enough while cases cannot be uploaded: every file a case can refer to ships in the jar.
 */
@Component
public class ClasspathAssetStorage implements AssetStorage {

    private static final String ROOT = "demo-assets/";

    /** {@code folder/file}, lower case. Keys come from the database, but a path is still a path. */
    private static final Pattern KEY = Pattern.compile("[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9.-]*");

    @Override
    public Resource load(String key) {
        if (key == null || !KEY.matcher(key).matches() || key.contains("..")) {
            throw new AssetUnavailableException(String.valueOf(key));
        }
        Resource resource = new ClassPathResource(ROOT + key);
        if (!resource.exists()) {
            throw new AssetUnavailableException(key);
        }
        return resource;
    }
}
