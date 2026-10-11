package dev.trabecula.portal.cases.api;

import java.util.UUID;

/**
 * Geometry of the CT volume. Hounsfield units are {@code stored * rescaleSlope + rescaleIntercept}.
 *
 * @param dimensions voxel counts along x, y and z
 * @param spacingMm voxel size along x, y and z
 * @param originMm centre of the first voxel
 * @param dataUrl where to download the voxels: little-endian int16, x fastest, then y, then z
 */
public record CtVolumeDto(
        UUID id,
        String description,
        int[] dimensions,
        double[] spacingMm,
        double[] originMm,
        double rescaleSlope,
        double rescaleIntercept,
        int suggestedBoneThresholdHu,
        String dataUrl) {}
