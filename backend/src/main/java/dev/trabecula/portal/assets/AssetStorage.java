package dev.trabecula.portal.assets;

import org.springframework.core.io.Resource;

/**
 * Where the large binary files of a case are kept: surface models and CT volumes.
 *
 * <p>The database only stores keys. That keeps rows small and lets the files move to object
 * storage (S3, Azure Blob) later without touching the rest of the application.
 */
public interface AssetStorage {

    /**
     * @param key a storage key as saved on the model or volume
     * @throws AssetUnavailableException if nothing is stored under the key
     */
    Resource load(String key);
}
