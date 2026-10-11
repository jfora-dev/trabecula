package dev.trabecula.portal.assets;

/** The database refers to a file that asset storage cannot provide. A server-side fault. */
public class AssetUnavailableException extends RuntimeException {

    public AssetUnavailableException(String key) {
        super("No asset is stored under the key '" + key + "'");
    }
}
